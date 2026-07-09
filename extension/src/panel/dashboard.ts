import * as vscode from "vscode";
import { SessionInfo } from "../types";
import { ParticipantStore } from "../config";
import { StatsHub } from "../stats";
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

export class DashboardProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "flowIntel.dashboard";

  private view: vscode.WebviewView | undefined;
  private host: DashboardHost | null = null;
  private enrolled = false;
  private statsSub: vscode.Disposable | undefined;
  private summaryTimer: NodeJS.Timeout | undefined;
  private pendingCheckin: "scheduled" | "manual" | null = null;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ParticipantStore,
    private readonly stats: StatsHub,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.ctx.extensionUri] };
    view.webview.html = getHtml(view.webview, this.ctx.extensionUri);

    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.postState();
        void this.postSummary();
        this.flushPending();
      }
    });

    this.postState();
    void this.postSummary();
    this.flushPending();
  }

  attach(host: DashboardHost): void {
    this.host = host;
    this.statsSub?.dispose();
    this.statsSub = this.stats.onDidChange(() => this.postState());
    if (!this.summaryTimer) {
      this.summaryTimer = setInterval(() => void this.postSummary(), SUMMARY_POLL_MS);
    }
    this.postState();
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
    this.postState();
  }

  setEnrolled(v: boolean): void {
    this.enrolled = v;
    this.postState();
  }

  refresh(): void {
    this.postState();
  }

  requestCheckIn(trigger: "scheduled" | "manual"): void {
    if (!this.host) {
      void vscode.window.showInformationMessage("Flow Intelligence: enroll first to check in.");
      return;
    }
    if (trigger === "scheduled") {
      // A scheduled prompt should be noticeable but not hijack the editor: show
      // a dismissible notification with an action, and only reveal the survey
      // card if the participant opts in. (The old 6s status-bar flash was easy
      // to miss, which suppressed the scheduled response rate.)
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
    // Reveal our view so the card is visible, then deliver it.
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
    switch (msg.type) {
      case "ready":
        this.postState();
        void this.postSummary();
        this.flushPending();
        break;
      case "refresh":
        void this.postSummary();
        break;
      case "checkinNow":
        this.requestCheckIn("manual");
        break;
      case "enroll":
        void vscode.commands.executeCommand("flowIntel.enroll");
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

  private postState(): void {
    if (!this.view) return;
    this.view.webview.postMessage({
      type: "state",
      enrolled: this.enrolled,
      running: this.host !== null && this.store.enabled,
      paused: this.host !== null && !this.store.enabled,
      sessionActive: this.host !== null && this.host.currentSession() !== null,
      live: this.stats.snapshot(),
    });
  }

  private async postSummary(): Promise<void> {
    if (!this.view || !this.host) return;
    const summary = await fetchSummary(this.store);
    if (summary) this.view.webview.postMessage({ type: "summary", summary });
  }

  dispose(): void {
    this.statsSub?.dispose();
    if (this.summaryTimer) clearInterval(this.summaryTimer);
  }
}
