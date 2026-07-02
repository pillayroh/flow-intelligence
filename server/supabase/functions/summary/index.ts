// POST /functions/v1/summary
// Auth: Authorization: Bearer <ingest_token>
// Returns aggregated, participant-scoped stats for the dashboard. No raw
// content is stored anywhere, so this only ever returns metadata aggregates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { bearerToken, sha256Hex } from "../_shared/token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EVENT_WINDOW = 5000;
const ESM_WINDOW = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: "missing_token" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: participant } = await supabase
    .from("participants")
    .select("participant_id, persona, created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!participant) return json({ error: "invalid_token" }, 401);

  const pid = participant.participant_id as string;

  const [{ data: sessions }, { data: events }, { data: esm }] = await Promise.all([
    supabase.from("sessions").select("session_id, started_at, ended_at").eq("participant_id", pid),
    supabase
      .from("events")
      .select("event_type, ts, payload")
      .eq("participant_id", pid)
      .order("ts", { ascending: false })
      .limit(EVENT_WINDOW),
    supabase
      .from("esm_responses")
      .select("ts, flow_score, frustration, confidence, trigger")
      .eq("participant_id", pid)
      .order("ts", { ascending: false })
      .limit(ESM_WINDOW),
  ]);

  const evs = events ?? [];
  const byType: Record<string, number> = {};
  let aiChars = 0;
  let humanChars = 0;
  const ai = { prompts: 0, messages: 0, agent_edits: 0, tab_edits: 0, tool_uses: 0, verifications: 0 };
  const human = { edit_bursts: 0, commits: 0, focus_switches: 0 };

  for (const e of evs) {
    byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.event_type) {
      case "prompt": ai.prompts++; break;
      case "agent_response":
      case "agent_thought": ai.messages++; break;
      case "agent_edit": ai.agent_edits++; aiChars += num(p.added_chars); break;
      case "tab_edit": ai.tab_edits++; aiChars += num(p.added_chars); break;
      case "tool_pre": ai.tool_uses++; break;
      case "shell_pre": if (p.command_class === "test") ai.verifications++; break;
      case "edit_burst": human.edit_bursts++; humanChars += num(p.added_chars); break;
      case "git_commit": human.commits++; break;
      case "focus_switch": human.focus_switches++; break;
    }
  }

  let activeMs = 0;
  for (const s of sessions ?? []) {
    const start = new Date(s.started_at).getTime();
    const end = s.ended_at ? new Date(s.ended_at).getTime() : start;
    if (end > start) activeMs += end - start;
  }

  const collabTotal = aiChars + humanChars;
  const recentEsm = (esm ?? []).slice().reverse();

  return json({
    participant_id: pid,
    persona: participant.persona ?? null,
    since: participant.created_at,
    totals: {
      events: evs.length,
      sessions: (sessions ?? []).length,
      active_ms: activeMs,
    },
    ai,
    human,
    collaboration: {
      ai_chars: aiChars,
      human_chars: humanChars,
      ai_ratio: collabTotal > 0 ? aiChars / collabTotal : 0,
    },
    by_type: byType,
    esm: recentEsm,
  });
});

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}
