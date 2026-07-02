import * as vscode from "vscode";
import { getSettings, ParticipantStore } from "../config";
import { SessionManager } from "../session";
import { log } from "../logger";

export interface CheckInRequester {
  requestCheckIn(trigger: "scheduled" | "manual"): void;
}

// Experience-sampling scheduler. Decides WHEN a scheduled flow check-in should
// appear (gated by active-coding time, capped per day) and asks the requester
// (the dashboard) to present it. The actual survey UI + submission live in the
// dashboard; scheduled responses are counted via noteScheduledAnswered().
export class EsmSampler {
  private timer: NodeJS.Timeout | undefined;
  private activeMsAtLastPrompt = 0;
  private targetMs = 0;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ParticipantStore,
    private readonly sessions: SessionManager,
    private readonly requester: CheckInRequester,
  ) {
    this.resetTarget();
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), 60_000);
  }

  private resetTarget(): void {
    const s = getSettings();
    const min = s.esmMinActiveMinutes;
    const max = Math.max(s.esmMaxActiveMinutes, min);
    const minutes = min + Math.random() * (max - min);
    this.targetMs = minutes * 60_000;
    this.activeMsAtLastPrompt = this.sessions.getActiveMs();
  }

  private tick(): void {
    if (!this.store.enabled) return;
    if (!this.sessions.currentSession()) return;
    if (!vscode.window.state.focused) return;
    if (this.dailyCount() >= getSettings().esmDailyCap) return;

    const activeDelta = this.sessions.getActiveMs() - this.activeMsAtLastPrompt;
    if (activeDelta < this.targetMs) return;

    this.requester.requestCheckIn("scheduled");
    this.resetTarget();
    log("scheduled check-in requested");
  }

  noteScheduledAnswered(): void {
    void this.ctx.globalState.update(this.dailyKey(), this.dailyCount() + 1);
  }

  private dailyKey(): string {
    return `flowIntel.esmCount.${new Date().toISOString().slice(0, 10)}`;
  }
  private dailyCount(): number {
    return this.ctx.globalState.get<number>(this.dailyKey()) ?? 0;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
