import * as vscode from "vscode";
import { initLogger, log } from "./logger";
import { ParticipantStore, patchForwarderConfig } from "./config";
import { enroll } from "./enrollment";
import { Transport } from "./transport";
import { SessionManager } from "./session";
import { Recorder } from "./recorder";
import { registerTelemetry } from "./telemetry";
import { EsmSampler } from "./esm/sampler";
import { uninstallHooks } from "./hooksBootstrap";
import { StatsHub } from "./stats";
import { DashboardProvider, DashboardHost } from "./panel/dashboard";
import { EsmResponse } from "./types";

let runtime: Runtime | undefined;

// Owns the live collection pipeline. Also acts as the dashboard host so the
// webview can read the current session and submit flow check-ins.
class Runtime implements DashboardHost {
  transport: Transport;
  sessions: SessionManager;
  sampler: EsmSampler;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ParticipantStore,
    stats: StatsHub,
    private readonly dashboard: DashboardProvider,
  ) {
    this.transport = new Transport(ctx, store, () => this.sessions.currentSession(), stats);
    this.sessions = new SessionManager(this.transport);
    const recorder = new Recorder(this.transport, this.sessions);
    this.sampler = new EsmSampler(ctx, store, this.sessions, this.dashboard);
    this.disposables.push(...registerTelemetry(recorder, this.sessions));
  }

  start(): void {
    this.transport.start();
    this.sessions.start();
    this.sampler.start();
    this.dashboard.attach(this);
    log("collection started");
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
  const store = new ParticipantStore(ctx);
  const stats = new StatsHub();
  ctx.subscriptions.push({ dispose: () => stats.dispose() });

  const dashboard = new DashboardProvider(ctx, store, stats);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewId, dashboard, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "flowIntel.status";
  ctx.subscriptions.push(statusBar);

  const refreshStatus = async () => {
    const enrolled = await store.isEnrolled();
    dashboard.setEnrolled(enrolled);
    dashboard.refresh();
    if (!enrolled) {
      statusBar.text = "$(sign-in) Flow: enroll";
      statusBar.tooltip = "Enroll in the Flow Intelligence study";
    } else if (store.enabled) {
      statusBar.text = "$(pulse) Flow";
      statusBar.tooltip = "Flow Intelligence is running in the background (metadata only). Click for options.";
    } else {
      statusBar.text = "$(circle-slash) Flow paused";
      statusBar.tooltip = "Flow Intelligence collection is paused. Click for options.";
    }
    statusBar.show();
  };

  const startIfEnrolled = async () => {
    if ((await store.isEnrolled()) && !runtime) {
      runtime = new Runtime(ctx, store, stats, dashboard);
      runtime.start();
    }
  };

  const openDashboard = () =>
    void vscode.commands.executeCommand(`${DashboardProvider.viewId}.focus`);

  ctx.subscriptions.push(
    vscode.commands.registerCommand("flowIntel.enroll", async () => {
      if (await store.isEnrolled()) {
        vscode.window.showInformationMessage("Flow Intelligence: already enrolled.");
        return;
      }
      if (await enroll(ctx, store)) {
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
        "Withdraw from the Flow Intelligence study? This stops all collection and removes the hooks.",
        { modal: true },
        "Withdraw",
      );
      if (confirm !== "Withdraw") return;
      await store.setEnabled(false);
      patchForwarderConfig({ enabled: false });
      uninstallHooks();
      if (runtime) {
        await runtime.dispose();
        runtime = undefined;
      }
      await store.clearToken();
      await refreshStatus();
      vscode.window.showInformationMessage("Flow Intelligence: you have withdrawn. Thank you.");
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

  if (!(await store.isEnrolled())) {
    const choice = await vscode.window.showInformationMessage(
      "Flow Intelligence study is installed. Enroll to start contributing anonymized flow data?",
      "Enroll",
      "Later",
    );
    if (choice === "Enroll") void vscode.commands.executeCommand("flowIntel.enroll");
  }
}

export async function deactivate(): Promise<void> {
  if (runtime) {
    await runtime.dispose();
    runtime = undefined;
  }
}
