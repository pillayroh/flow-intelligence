import * as vscode from "vscode";
import { SessionInfo } from "../types";
import { ParticipantStore } from "../config";
import { StatsHub } from "../stats";
import { MirrorStore } from "../mirror/store";
import { computeMirror } from "../mirror/archetype";
import { fetchSummary } from "../summary";
import { getHtml } from "./html";

export interface DashboardHost {
  currentSession(): SessionInfo | null;
  submitEsm(data: {
    flow: number;
    frustration: number | null;
    confidence: number | null;
    trigger: "scheduled" | "manual";
  }): void;
}

const SUMMARY_POLL_MS = 45_000;
const LIVE_REFRESH_MS = 2_000;

function localOverall(mirror: MirrorStore) {
  const m = mirror.getInput(7);
  const total = m.humanTypedChars + m.aiInsertChars;
  return {
    scope: "local" as const,
    scopeLabel: "Last 7 days",
    human_chars: m.humanTypedChars,
    ai_chars: m.aiInsertChars,
    ai_ratio: total > 0 ? m.aiInsertChars / total : 0,
    edit_bursts: null as number | null,
    focus_switches: m.focusSwitches,
    commits: m.commits,
    prompts: null as number | null,
    agent_edits: null as number | null,
    tab_edits: null as number | null,
    verifications: null as number | null,
    active_minutes: Math.round(m.activeMinutes),
  };
}

export class DashboardProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "flowIntel.dashboard";

  private view: vscode.WebviewView | undefined;
  private host: DashboardHost | null = null;
  private enrolled = false;
  private enrollmentMode: "personal" | "study" | undefined;
  private statsSub: vscode.Disposable | undefined;
  private summaryTimer: NodeJS.Timeout | undefined;
  private liveRefreshTimer: NodeJS.Timeout | undefined;
  private pendingCheckin: "scheduled" | "manual" | null = null;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ParticipantStore,
    private readonly stats: StatsHub,
    private readonly mirror: MirrorStore,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    if (this.liveRefreshTimer) {
      clearInterval(this.liveRefreshTimer);
      this.liveRefreshTimer = undefined;
    }
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.ctx.extensionUri] };
    view.webview.html = getHtml(view.webview, this.ctx.extensionUri);

    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.postState();
        void this.postSummary();
        this.flushPending();
      }
    });

    this.liveRefreshTimer = setInterval(() => {
      if (view.visible) void this.postState();
    }, LIVE_REFRESH_MS);

    void this.postState();
    void this.postSummary();
    this.flushPending();
  }

  attach(host: DashboardHost): void {
    this.host = host;
    this.statsSub?.dispose();
    this.statsSub = this.stats.onDidChange(() => void this.postState());
    if (!this.summaryTimer) {
      this.summaryTimer = setInterval(() => void this.postSummary(), SUMMARY_POLL_MS);
    }
    void this.postState();
    void this.postSummary();
  }

  detach(): void {
    this.host = null;
    this.statsSub?.dispose();
    this.statsSub = undefined;
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = undefined;
    }
    void this.postState();
  }

  setEnrolled(v: boolean): void {
    this.enrolled = v;
    this.enrollmentMode = this.store.enrollmentMode;
    void this.postState();
  }

  refresh(): void {
    void this.postState();
    void this.postSummary();
  }

  requestCheckIn(trigger: "scheduled" | "manual"): void {
    if (!this.host) {
      void vscode.window.showInformationMessage("Flow Intelligence: enable cloud sync to check in.");
      return;
    }
    if (trigger === "scheduled") {
      void vscode.window
        .showInformationMessage(
          "Flow Intelligence: got a moment to rate your current flow?",
          "Check in",
          "Not now",
        )
        .then((choice) => {
          if (choice === "Check in") this.deliverCheckIn("scheduled");
        });
      return;
    }
    this.deliverCheckIn(trigger);
  }

  private deliverCheckIn(trigger: "scheduled" | "manual"): void {
    this.pendingCheckin = trigger;
    void vscode.commands.executeCommand(`${DashboardProvider.viewId}.focus`);
    this.flushPending();
  }

  private flushPending(): void {
    if (this.pendingCheckin && this.view) {
      this.view.webview.postMessage({ type: "checkin", trigger: this.pendingCheckin });
      this.pendingCheckin = null;
    }
  }

  private onMessage(msg: { type: string; [k: string]: unknown }): void {
    void this.handleMessage(msg);
  }

  private async handleMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case "ready":
        await this.postState();
        await this.postSummary();
        this.flushPending();
        break;
      case "refresh":
        await this.postSummary();
        break;
      case "checkinNow":
        this.requestCheckIn("manual");
        break;
      case "enrollPersonal":
        void vscode.commands.executeCommand("flowIntel.enrollPersonal");
        break;
      case "enrollStudy":
        void vscode.commands.executeCommand("flowIntel.enrollStudy");
        break;
      case "pauseSync":
        void vscode.commands.executeCommand("flowIntel.pause");
        break;
      case "resumeSync":
        void vscode.commands.executeCommand("flowIntel.resume");
        break;
      case "disconnectSync":
        void vscode.commands.executeCommand("flowIntel.withdraw");
        break;
      case "esm":
        if (this.host && typeof msg.flow === "number") {
          this.host.submitEsm({
            flow: msg.flow as number,
            frustration: (msg.frustration as number) ?? null,
            confidence: (msg.confidence as number) ?? null,
            trigger: (msg.trigger as "scheduled" | "manual") ?? "manual",
          });
        }
        break;
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) return;
    let mirror;
    try {
      mirror = computeMirror(this.mirror.getInput(7));
    } catch (err) {
      mirror = {
        key: "warming_up",
        name: "Warming up",
        tagline: "Local analytics are loading.",
        blurb: `Persona unavailable: ${String(err)}`,
        signature: [],
        ready: false,
        aiReliance: 0,
        focusContinuity: 0,
      };
    }
    this.enrollmentMode = this.store.enrollmentMode;
    this.view.webview.postMessage({
      type: "state",
      enrolled: this.enrolled,
      enrollmentMode: this.enrollmentMode ?? null,
      running: this.host !== null && this.store.enabled,
      paused: this.host !== null && !this.store.enabled,
      sessionActive: this.host !== null && this.host.currentSession() !== null,
      live: this.stats.snapshot(),
      overall: localOverall(this.mirror),
      mirror,
    });
  }

  private async postSummary(): Promise<void> {
    if (!this.view) return;
    if (!this.enrolled) return;
    const summary = await fetchSummary(this.store);
    if (summary) this.view.webview.postMessage({ type: "summary", summary });
  }

  dispose(): void {
    this.statsSub?.dispose();
    if (this.summaryTimer) clearInterval(this.summaryTimer);
    if (this.liveRefreshTimer) clearInterval(this.liveRefreshTimer);
  }
}
