import * as vscode from "vscode";
import { initLogger, log } from "./logger";
import { ParticipantStore, patchForwarderConfig } from "./config";
import { enroll, enrollPersonal, enrollStudy } from "./enrollment";
import { maybeNudgeCloudSync } from "./cloudSyncNudge";
import { Transport } from "./transport";
import { SessionManager } from "./session";
import { Recorder } from "./recorder";
import { registerTelemetry } from "./telemetry";
import { EsmSampler } from "./esm/sampler";
import { installHooks, uninstallHooks } from "./hooksBootstrap";
import { installClaudeHooks, uninstallClaudeHooks } from "./claudeBootstrap";
import { StatsHub } from "./stats";
import { MirrorStore } from "./mirror/store";
import { DashboardProvider, DashboardHost } from "./panel/dashboard";
import { EsmResponse } from "./types";

let runtime: Runtime | undefined;

// Owns the collection pipeline. The behavioral pipeline (sessions, edits, focus,
// git) runs locally for everyone so the AI Collaboration Mirror works without
// enrollment. Uploading to the research backend and the ESM sampler are gated
// on enrollment via setEnrolled(). Also acts as the dashboard host.
class Runtime implements DashboardHost {
  transport: Transport;
  sessions: SessionManager;
  sampler: EsmSampler;
  private disposables: vscode.Disposable[] = [];
  private samplerRunning = false;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ParticipantStore,
    stats: StatsHub,
    private readonly dashboard: DashboardProvider,
    mirror: MirrorStore,
  ) {
    this.transport = new Transport(ctx, store, () => this.sessions.sessionForReport(), stats);
    this.sessions = new SessionManager(ctx, this.transport, mirror);
    const recorder = new Recorder(this.transport, this.sessions);
    this.sampler = new EsmSampler(ctx, store, this.sessions, this.dashboard);
    this.disposables.push(...registerTelemetry(recorder, this.sessions, stats));
  }

  // Local mode: behavioral collection + Mirror only. No upload, no ESM prompts.
  start(): void {
    this.transport.start();
    this.sessions.start();
    this.dashboard.attach(this);
    log("local collection started");
  }

  // Toggle research participation: uploading + the scheduled ESM sampler.
  setEnrolled(enrolled: boolean): void {
    this.transport.setUploadEnabled(enrolled);
    if (enrolled && !this.samplerRunning) {
      this.sampler.start();
      this.samplerRunning = true;
      log("research upload + ESM sampler enabled");
    } else if (!enrolled && this.samplerRunning) {
      this.sampler.stop();
      this.samplerRunning = false;
      log("research upload + ESM sampler disabled");
    }
  }

  currentSession() {
    return this.sessions.currentSession();
  }

  submitEsm(data: {
    flow: number;
    frustration: number | null;
    confidence: number | null;
    trigger: "scheduled" | "manual";
  }): void {
    const resp: EsmResponse = {
      ts: new Date().toISOString(),
      session_id: this.sessions.currentSessionId(),
      flow_score: data.flow,
      frustration: data.frustration,
      confidence: data.confidence,
      trigger: data.trigger,
    };
    this.transport.enqueueEsm(resp);
    if (data.trigger === "scheduled") this.sampler.noteScheduledAnswered();
    log(`esm recorded (${data.trigger}) flow=${data.flow}`);
  }

  async dispose(): Promise<void> {
    this.dashboard.detach();
    this.sampler.dispose();
    this.sessions.dispose();
    for (const d of this.disposables) d.dispose();
    await this.transport.dispose();
  }
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  initLogger();
  try {
    await activateExtension(ctx);
  } catch (err) {
    log(`activation failed: ${String(err)}`);
    void vscode.window.showErrorMessage(
      `Flow Intelligence failed to start: ${String(err)}. See Output → Flow Intelligence.`,
    );
  }
}

async function activateExtension(ctx: vscode.ExtensionContext): Promise<void> {
  const store = new ParticipantStore(ctx);
  const mirror = new MirrorStore(ctx);
  const stats = new StatsHub(mirror);
  ctx.subscriptions.push({ dispose: () => stats.dispose() });
  ctx.subscriptions.push({ dispose: () => mirror.flush() });

  const dashboard = new DashboardProvider(ctx, store, stats, mirror);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewId, dashboard, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Always-visible entry point in the bottom status bar. Always opens the
  // dashboard — cloud sync is offered inside the panel, not via the status bar.
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "flowIntel.open";
  ctx.subscriptions.push(statusBar);

  const refreshStatus = async () => {
    const enrolled = await store.isEnrolled();
    dashboard.setEnrolled(enrolled);
    dashboard.refresh();
    statusBar.command = "flowIntel.open";
    if (!enrolled) {
      statusBar.text = "$(cloud-upload) Flow: sync";
      statusBar.tooltip =
        "Local Mirror is active. Click to open the dashboard and enable cloud sync.";
    } else if (store.enabled) {
      const mode = store.enrollmentMode === "study" ? "study" : "cloud";
      statusBar.text = "$(cloud) Flow";
      statusBar.tooltip = `Flow Intelligence syncing (${mode}, metadata only). Click for dashboard.`;
    } else {
      statusBar.text = "$(circle-slash) Flow paused";
      statusBar.tooltip = "Flow Intelligence cloud sync is paused. Click for dashboard.";
    }
    statusBar.show();
  };

  // The local pipeline (behavioral collection + Mirror) runs for everyone,
  // enrolled or not, so the 900+ installs get value without a study code.
  runtime = new Runtime(ctx, store, stats, dashboard, mirror);
  runtime.start();

  const startIfEnrolled = async () => {
    if (!(await store.isEnrolled())) return;
    // Self-heal: re-install hooks and refresh the forwarder on every launch so
    // the runtime path is re-resolved (fixes cases where the JS runtime was
    // installed after enrollment) and the forwarder stays up to date.
    try {
      installHooks(ctx);
      installClaudeHooks();
    } catch (err) {
      log(`hook self-heal failed: ${String(err)}`);
    }
    runtime?.setEnrolled(true);
  };

  const openDashboard = async () => {
    // Reveal the activity-bar container first so the webview is actually visible.
    await vscode.commands.executeCommand("workbench.view.extension.flowIntel");
    await vscode.commands.executeCommand(`${DashboardProvider.viewId}.focus`);
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand("flowIntel.enroll", async () => {
      if (await store.isEnrolled()) {
        vscode.window.showInformationMessage("Flow Intelligence: already syncing to the cloud.");
        return;
      }
      if (await enroll(ctx, store)) {
        await startIfEnrolled();
        await refreshStatus();
        openDashboard();
      }
    }),

    vscode.commands.registerCommand("flowIntel.enrollPersonal", async () => {
      if (await store.isEnrolled()) {
        vscode.window.showInformationMessage("Flow Intelligence: cloud sync is already enabled.");
        return;
      }
      if (await enrollPersonal(ctx, store)) {
        await startIfEnrolled();
        await refreshStatus();
        openDashboard();
      }
    }),

    vscode.commands.registerCommand("flowIntel.enrollStudy", async () => {
      if (await store.isEnrolled()) {
        vscode.window.showInformationMessage("Flow Intelligence: cloud sync is already enabled.");
        return;
      }
      if (await enrollStudy(ctx, store)) {
        await startIfEnrolled();
        await refreshStatus();
        openDashboard();
      }
    }),

    vscode.commands.registerCommand("flowIntel.checkIn", () => {
      dashboard.requestCheckIn("manual");
    }),

    vscode.commands.registerCommand("flowIntel.open", openDashboard),

    vscode.commands.registerCommand("flowIntel.pause", async () => {
      await store.setEnabled(false);
      patchForwarderConfig({ enabled: false });
      await refreshStatus();
      vscode.window.showInformationMessage("Flow Intelligence: collection paused.");
    }),

    vscode.commands.registerCommand("flowIntel.resume", async () => {
      await store.setEnabled(true);
      patchForwarderConfig({ enabled: true });
      await startIfEnrolled();
      await refreshStatus();
      vscode.window.showInformationMessage("Flow Intelligence: collection resumed.");
    }),

    vscode.commands.registerCommand("flowIntel.withdraw", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Stop cloud sync and remove AI hooks? Your local Mirror keeps working on-device.",
        { modal: true },
        "Stop cloud sync",
      );
      if (confirm !== "Stop cloud sync") return;
      patchForwarderConfig({ enabled: false });
      uninstallHooks();
      uninstallClaudeHooks();
      runtime?.setEnrolled(false);
      await store.clearToken();
      await store.clearParticipantId();
      await store.clearEnrollmentMode();
      await store.setEnabled(true);
      await refreshStatus();
      vscode.window.showInformationMessage(
        "Flow Intelligence: cloud sync stopped. Your local Mirror still works.",
      );
    }),

    vscode.commands.registerCommand("flowIntel.status", async () => {
      const enrolled = await store.isEnrolled();
      if (!enrolled) {
        void vscode.commands.executeCommand("flowIntel.enroll");
        return;
      }
      const actions: vscode.QuickPickItem[] = [
        { label: "$(dashboard) Open dashboard" },
        { label: "$(feedback) Flow check-in now" },
        store.enabled
          ? { label: "$(circle-slash) Pause collection" }
          : { label: "$(play) Resume collection" },
        { label: "$(sign-out) Withdraw from study" },
      ];
      const pick = await vscode.window.showQuickPick(actions, { title: "Flow Intelligence" });
      if (!pick) return;
      if (pick.label.includes("dashboard")) openDashboard();
      else if (pick.label.includes("check-in")) void vscode.commands.executeCommand("flowIntel.checkIn");
      else if (pick.label.includes("Pause")) void vscode.commands.executeCommand("flowIntel.pause");
      else if (pick.label.includes("Resume")) void vscode.commands.executeCommand("flowIntel.resume");
      else if (pick.label.includes("Withdraw")) void vscode.commands.executeCommand("flowIntel.withdraw");
    }),
  );

  await startIfEnrolled();
  await refreshStatus();
  await maybeNudgeCloudSync(ctx, store);
}

export async function deactivate(): Promise<void> {
  if (runtime) {
    await runtime.dispose();
    runtime = undefined;
  }
}
