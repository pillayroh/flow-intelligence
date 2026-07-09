import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { SessionInfo, TelemetryEvent } from "./types";
import { Transport } from "./transport";
import { getSettings, patchForwarderConfig } from "./config";
import { log } from "./logger";

// Cumulative active-coding time is persisted so the ESM scheduler's countdown
// survives editor restarts (otherwise it resets to 0 on every launch and the
// activity gate is essentially never reached in short sessions).
const ACTIVE_MS_KEY = "flowIntel.activeMs";

// Tracks coding-session boundaries and cumulative active time. A session ends
// after `idleThresholdMinutes` of no activity and a new one begins on the next
// activity. The active session_id is mirrored into the forwarder config so hook
// events get tagged with the same session.
export class SessionManager {
  private session: SessionInfo | null = null;
  // A just-ended session awaiting one final upload so its ended_at reaches the
  // server (the sessions table can't compute durations without it). Reported by
  // sessionForReport() and cleared when the next session begins.
  private closed: SessionInfo | null = null;
  private lastActivity = 0;
  private activeMs = 0;
  private idleTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly transport: Transport,
  ) {
    this.activeMs = ctx.globalState.get<number>(ACTIVE_MS_KEY) ?? 0;
  }

  start(): void {
    this.idleTimer = setInterval(() => this.checkIdle(), 30_000);
  }

  markActivity(): void {
    const now = Date.now();
    const idleMs = getSettings().idleThresholdMinutes * 60_000;

    if (!this.session) {
      this.beginSession(now);
    } else if (this.lastActivity && now - this.lastActivity < idleMs) {
      this.activeMs += now - this.lastActivity;
    }
    this.lastActivity = now;
  }

  private checkIdle(): void {
    this.persistActive();
    if (!this.session) return;
    const idleMs = getSettings().idleThresholdMinutes * 60_000;
    if (Date.now() - this.lastActivity > idleMs) {
      this.endSession();
    }
  }

  private persistActive(): void {
    void this.ctx.globalState.update(ACTIVE_MS_KEY, this.activeMs);
  }

  private beginSession(now: number): void {
    this.closed = null;
    this.session = {
      session_id: randomUUID(),
      started_at: new Date(now).toISOString(),
      ended_at: null,
      editor_version: vscode.version,
    };
    patchForwarderConfig({ session_id: this.session.session_id });
    this.transport.enqueue(this.buildEvent("session_start", {}));
    log(`session started ${this.session.session_id}`);
  }

  private endSession(): void {
    if (!this.session) return;
    this.session.ended_at = new Date().toISOString();
    // Emit session_end while the session is still current so the event carries
    // the correct session_id, then hold the ended session for one final upload.
    this.transport.enqueue(this.buildEvent("session_end", {}));
    this.closed = this.session;
    patchForwarderConfig({ session_id: null });
    log(`session ended ${this.session.session_id}`);
    this.session = null;
    this.persistActive();
    // Prompt a flush so the ended_at reaches the sessions table promptly (the
    // just-enqueued session_end guarantees the batch is non-empty).
    void this.transport.flush();
  }

  currentSession(): SessionInfo | null {
    return this.session;
  }
  currentSessionId(): string | null {
    return this.session?.session_id ?? null;
  }
  // The session the transport should upsert: the active one, or a just-ended one
  // still needing its ended_at persisted. Distinct from currentSession(), which
  // reflects only live activity (used for gating check-ins and dashboard state).
  sessionForReport(): SessionInfo | null {
    return this.session ?? this.closed;
  }
  getActiveMs(): number {
    return this.activeMs;
  }

  private buildEvent(type: string, payload: Record<string, unknown>): TelemetryEvent {
    return {
      ts: new Date().toISOString(),
      source: "extension",
      event_type: type,
      session_id: this.currentSessionId(),
      payload,
    };
  }

  dispose(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.endSession();
    this.persistActive();
  }
}
