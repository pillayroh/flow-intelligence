export type EventSource = "extension" | "hook";

export interface TelemetryEvent {
  ts: string;
  source: EventSource;
  event_type: string;
  session_id: string | null;
  payload: Record<string, unknown>;
}

export interface EsmResponse {
  ts: string;
  session_id: string | null;
  flow_score: number | null;
  frustration: number | null;
  confidence: number | null;
  trigger: "scheduled" | "manual";
}

export interface SessionInfo {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  editor_version: string;
}

// Shape of ~/.cursor/flow-intel/config.json, read by the hook forwarder.
export interface ForwarderConfig {
  ingest_url: string;
  token: string;
  apikey?: string;
  participant_id: string;
  session_id: string | null;
  enabled: boolean;
  debug: boolean;
}
