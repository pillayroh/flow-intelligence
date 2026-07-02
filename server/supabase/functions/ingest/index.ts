// POST /functions/v1/ingest
// Auth: Authorization: Bearer <ingest_token>
// Body: {
//   session?:   { session_id, started_at, ended_at?, editor_version? },
//   events?:    [ { ts, source, event_type, payload } ],
//   esm?:       [ { ts, session_id?, flow_score, frustration, confidence, trigger } ]
// }
// Returns: { events_inserted, esm_inserted }
//
// Authenticates the opaque per-participant token, upserts the session, and
// batch-inserts events + ESM responses. Rejects any event payload that carries
// free-text content as defense-in-depth for the "metadata, never content" rule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { bearerToken, sha256Hex } from "../_shared/token.ts";
import { clampScore, isCleanPayload, isIsoTimestamp } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_EVENTS = 500;
const MAX_ESM = 50;
const VALID_SOURCES = new Set(["hook", "extension"]);
const VALID_TRIGGERS = new Set(["scheduled", "manual"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: "missing_token" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: participant, error: pErr } = await supabase
    .from("participants")
    .select("participant_id, withdrawn_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (pErr) return json({ error: "auth_lookup_failed" }, 500);
  if (!participant) return json({ error: "invalid_token" }, 401);
  if (participant.withdrawn_at) return json({ error: "withdrawn" }, 403);

  const participantId = participant.participant_id as string;

  // --- Session upsert -------------------------------------------------------
  const session = body.session as Record<string, unknown> | undefined;
  if (session && typeof session.session_id === "string") {
    if (!isIsoTimestamp(session.started_at)) {
      return json({ error: "invalid_session_started_at" }, 400);
    }
    const { error: sErr } = await supabase.from("sessions").upsert(
      {
        session_id: session.session_id,
        participant_id: participantId,
        started_at: session.started_at as string,
        ended_at: isIsoTimestamp(session.ended_at)
          ? (session.ended_at as string)
          : null,
        editor_version:
          typeof session.editor_version === "string"
            ? (session.editor_version as string).slice(0, 200)
            : null,
      },
      { onConflict: "session_id" },
    );
    if (sErr) return json({ error: "session_upsert_failed" }, 500);
  }

  // --- Events ---------------------------------------------------------------
  let eventsInserted = 0;
  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length > MAX_EVENTS) {
    return json({ error: "too_many_events" }, 413);
  }
  const eventRows = [];
  for (const e of rawEvents) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    if (!isIsoTimestamp(ev.ts)) continue;
    if (typeof ev.event_type !== "string" || !ev.event_type) continue;
    if (!VALID_SOURCES.has(String(ev.source))) continue;
    const payload = ev.payload ?? {};
    if (!isCleanPayload(payload)) {
      return json({ error: "payload_contains_content", event_type: ev.event_type }, 422);
    }
    eventRows.push({
      participant_id: participantId,
      session_id: typeof ev.session_id === "string" ? ev.session_id : null,
      ts: ev.ts as string,
      source: ev.source as string,
      event_type: (ev.event_type as string).slice(0, 100),
      payload,
    });
  }
  if (eventRows.length) {
    const { error: evErr } = await supabase.from("events").insert(eventRows);
    if (evErr) return json({ error: "events_insert_failed" }, 500);
    eventsInserted = eventRows.length;
  }

  // --- ESM responses --------------------------------------------------------
  let esmInserted = 0;
  const rawEsm = Array.isArray(body.esm) ? body.esm : [];
  if (rawEsm.length > MAX_ESM) return json({ error: "too_many_esm" }, 413);
  const esmRows = [];
  for (const r of rawEsm) {
    if (!r || typeof r !== "object") continue;
    const resp = r as Record<string, unknown>;
    if (!isIsoTimestamp(resp.ts)) continue;
    if (!VALID_TRIGGERS.has(String(resp.trigger))) continue;
    esmRows.push({
      participant_id: participantId,
      session_id: typeof resp.session_id === "string" ? resp.session_id : null,
      ts: resp.ts as string,
      flow_score: clampScore(resp.flow_score),
      frustration: clampScore(resp.frustration),
      confidence: clampScore(resp.confidence),
      trigger: resp.trigger as string,
    });
  }
  if (esmRows.length) {
    const { error: esmErr } = await supabase.from("esm_responses").insert(esmRows);
    if (esmErr) return json({ error: "esm_insert_failed" }, 500);
    esmInserted = esmRows.length;
  }

  return json({ events_inserted: eventsInserted, esm_inserted: esmInserted });
});
