// POST /functions/v1/enroll
// Body: { study_code, consent_version, editor_version?, platform?, primary_ai_tool? }
// Returns: { participant_id, ingest_token }
//
// Validates the study code, enforces an optional participant cap, issues an
// opaque ingest token (storing only its hash), and creates the participant row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { generateToken, sha256Hex } from "../_shared/token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const studyCode = String(body.study_code ?? "").trim();
  const consentVersion = String(body.consent_version ?? "").trim();
  if (!studyCode || !consentVersion) {
    return json({ error: "missing_study_code_or_consent_version" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: code, error: codeErr } = await supabase
    .from("study_codes")
    .select("code, active, max_participants")
    .eq("code", studyCode)
    .maybeSingle();

  if (codeErr) return json({ error: "lookup_failed" }, 500);
  if (!code || !code.active) return json({ error: "invalid_study_code" }, 403);

  if (typeof code.max_participants === "number") {
    const { count, error: countErr } = await supabase
      .from("participants")
      .select("participant_id", { count: "exact", head: true })
      .eq("study_code", studyCode);
    if (countErr) return json({ error: "lookup_failed" }, 500);
    if ((count ?? 0) >= code.max_participants) {
      return json({ error: "study_full" }, 403);
    }
  }

  const token = generateToken();
  const tokenHash = await sha256Hex(token);

  const { data: participant, error: insertErr } = await supabase
    .from("participants")
    .insert({
      study_code: studyCode,
      token_hash: tokenHash,
      consent_version: consentVersion,
      editor_version: strOrNull(body.editor_version),
      platform: strOrNull(body.platform),
      primary_ai_tool: strOrNull(body.primary_ai_tool),
    })
    .select("participant_id")
    .single();

  if (insertErr || !participant) return json({ error: "enroll_failed" }, 500);

  return json({
    participant_id: participant.participant_id,
    ingest_token: token,
  });
});

function strOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s.slice(0, 200) : null;
}
