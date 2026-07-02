import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { SessionInfo, TelemetryEvent } from "./types";
import { Transport } from "./transport";
import { getSettings, patchForwarderConfig } from "./config";
import { log } from "./logger";

// Tracks coding-session boundaries and cumulative active time. A session ends
// after `idleThresholdMinutes` of no activity and a new one begins on the next
// activity. The active session_id is mirrored into the forwarder config so hook
// events get tagged with the same session.
export class SessionManager {
  private session: SessionInfo | null = null;
  private lastActivity = 0;
  private activeMs = 0;
  private idleTimer: NodeJS.Timeout | undefined;

  constructor(private readonly transport: Transport) {}

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
    if (!this.session) return;
    const idleMs = getSettings().idleThresholdMinutes * 60_000;
    if (Date.now() - this.lastActivity > idleMs) {
      this.endSession();
    }
  }

  private beginSession(now: number): void {
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
    this.transport.enqueue(this.buildEvent("session_end", {}));
    patchForwarderConfig({ session_id: null });
    log(`session ended ${this.session.session_id}`);
    this.session = null;
  }

  currentSession(): SessionInfo | null {
    return this.session;
  }
  currentSessionId(): string | null {
    return this.session?.session_id ?? null;
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
  }
}
