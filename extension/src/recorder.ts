import { TelemetryEvent } from "./types";
import { Transport } from "./transport";
import { SessionManager } from "./session";

// Central helper collectors use to emit an event. Stamps timestamp, source,
// and the current session id, then hands off to the transport queue.
export class Recorder {
  constructor(
    private readonly transport: Transport,
    private readonly sessions: SessionManager,
  ) {}

  record(eventType: string, payload: Record<string, unknown> = {}): void {
    const event: TelemetryEvent = {
      ts: new Date().toISOString(),
      source: "extension",
      event_type: eventType,
      session_id: this.sessions.currentSessionId(),
      payload,
    };
    this.transport.enqueue(event);
  }
}
