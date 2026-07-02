import { getSettings, ParticipantStore, summaryUrl } from "./config";
import { postJson } from "./http";
import { log } from "./logger";

// Server-side aggregates for the dashboard (includes AI-interaction totals that
// arrive via hooks and never touch the extension). Returns null when offline or
// not configured; the dashboard falls back to the live local snapshot.
export interface ServerSummary {
  participant_id: string;
  persona: string | null;
  since: string;
  totals: { events: number; sessions: number; active_ms: number };
  ai: {
    prompts: number;
    messages: number;
    agent_edits: number;
    tab_edits: number;
    tool_uses: number;
    verifications: number;
  };
  human: { edit_bursts: number; commits: number; focus_switches: number };
  collaboration: { ai_chars: number; human_chars: number; ai_ratio: number };
  by_type: Record<string, number>;
  esm: Array<{
    ts: string;
    flow_score: number | null;
    frustration: number | null;
    confidence: number | null;
    trigger: string;
  }>;
}

export async function fetchSummary(store: ParticipantStore): Promise<ServerSummary | null> {
  const settings = getSettings();
  const token = await store.getToken();
  if (!settings.supabaseUrl || !token) return null;
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (settings.supabaseAnonKey) headers["apikey"] = settings.supabaseAnonKey;
    const res = await postJson(summaryUrl(settings), {}, headers, 8000);
    if (res.status < 200 || res.status >= 300) {
      log(`summary non-2xx: ${res.status}`);
      return null;
    }
    return JSON.parse(res.body) as ServerSummary;
  } catch (err) {
    log(`summary fetch failed: ${String(err)}`);
    return null;
  }
}
