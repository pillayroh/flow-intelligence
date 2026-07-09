// Flow Intelligence — read-only pilot data pull + Phase-0 aggregation.
//
// Reads Supabase with the service-role key (bypasses RLS), pulls the four
// tables, computes instrument-validation aggregates, and writes
// data/pilot.json (aggregates, safe to inspect) + data/raw.json (raw rows,
// gitignored). Nothing is written back to Supabase — SELECTs only.
//
// Usage:  node pull.mjs
// Requires: analysis/.env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, "data");

// --- tiny .env loader (no dependency) ------------------------------------
function loadEnv() {
  const p = path.join(HERE, ".env");
  if (!fs.existsSync(p)) {
    fail(`missing ${p}. Copy .env.example to .env and fill in the service-role key.`);
  }
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
function fail(msg) {
  console.error(`\n[pull] ERROR: ${msg}\n`);
  process.exit(1);
}

loadEnv();
const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_BASE) fail("SUPABASE_URL not set.");
if (!KEY) fail("SUPABASE_SERVICE_ROLE_KEY not set (Project Settings -> API -> service_role).");

// --- PostgREST fetch with pagination -------------------------------------
async function selectAll(table, select = "*") {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=${select}`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${to}`,
        "Range-Unit": "items",
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      fail(`GET ${table} -> ${res.status} ${res.statusText}\n${body.slice(0, 400)}`);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

// --- aggregation helpers -------------------------------------------------
const inc = (o, k, n = 1) => (o[k] = (o[k] || 0) + n);
function dist1to5() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, null: 0 };
}
function fiveNum(arr) {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
  return { n: a.length, min: a[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: a[a.length - 1] };
}
// agent attribution: hook events carry payload.agent (cursor|claude_code);
// behavioral edit_insert is the tool-agnostic estimate.
function agentOf(ev) {
  if (ev.source === "hook") return ev.payload?.agent || "cursor";
  if (ev.event_type === "edit_insert") return "estimated";
  return "behavioral";
}

async function main() {
  console.log(`[pull] project: ${URL_BASE}`);
  const [participants, sessions, events, esm] = await Promise.all([
    selectAll("participants"),
    selectAll("sessions"),
    selectAll("events"),
    selectAll("esm_responses"),
  ]);
  console.log(
    `[pull] participants=${participants.length} sessions=${sessions.length} ` +
      `events=${events.length} esm=${esm.length}`,
  );

  // ---- participants ----
  const byPlatform = {};
  const byTool = {};
  let withdrawn = 0;
  for (const p of participants) {
    inc(byPlatform, p.platform || "unknown");
    inc(byTool, p.primary_ai_tool || "unknown");
    if (p.withdrawn_at) withdrawn++;
  }

  // ---- events: counts by type / source / agent / participant ----
  const byType = {};
  const bySource = {};
  const byAgent = {};
  const eventsPerParticipant = {};
  // null-field health check for key event types
  const nullCheck = {
    agent_edit: { total: 0, null_added_chars: 0 },
    tab_edit: { total: 0, null_added_chars: 0 },
    edit_burst: { total: 0, null_added_chars: 0 },
    prompt: { total: 0, null_prompt_length: 0 },
  };
  // measured vs estimated AI contribution (chars)
  let measuredAiChars = 0;
  let estimatedAiChars = 0;
  let humanEditChars = 0;
  for (const e of events) {
    inc(byType, e.event_type);
    inc(bySource, e.source);
    inc(byAgent, agentOf(e));
    inc(eventsPerParticipant, e.participant_id);
    const pl = e.payload || {};
    if (e.event_type === "agent_edit") {
      nullCheck.agent_edit.total++;
      if (pl.added_chars == null) nullCheck.agent_edit.null_added_chars++;
      measuredAiChars += Number(pl.added_chars) || 0;
    } else if (e.event_type === "tab_edit") {
      nullCheck.tab_edit.total++;
      if (pl.added_chars == null) nullCheck.tab_edit.null_added_chars++;
      measuredAiChars += Number(pl.added_chars) || 0;
    } else if (e.event_type === "edit_insert") {
      estimatedAiChars += Number(pl.added_chars) || 0;
    } else if (e.event_type === "edit_burst") {
      nullCheck.edit_burst.total++;
      if (pl.added_chars == null) nullCheck.edit_burst.null_added_chars++;
      humanEditChars += Number(pl.added_chars) || 0;
    } else if (e.event_type === "prompt") {
      nullCheck.prompt.total++;
      if (pl.prompt_length == null) nullCheck.prompt.null_prompt_length++;
    }
  }

  // ---- ESM label distributions ----
  const flow = dist1to5();
  const frustration = dist1to5();
  const confidence = dist1to5();
  const byTrigger = {};
  for (const r of esm) {
    flow[r.flow_score ?? "null"]++;
    frustration[r.frustration ?? "null"]++;
    confidence[r.confidence ?? "null"]++;
    inc(byTrigger, r.trigger || "unknown");
  }

  // ---- labeled-window validation: events in [t-15m, t] before each ESM ----
  // Confirms the core join (features <- lookback window around a label) works.
  const WINDOW_MS = 15 * 60 * 1000;
  const evByParticipant = {};
  for (const e of events) {
    (evByParticipant[e.participant_id] ??= []).push(e);
  }
  for (const arr of Object.values(evByParticipant)) {
    arr.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  }
  const windowCounts = [];
  let esmWithEvents = 0;
  for (const r of esm) {
    const end = new Date(r.ts).getTime();
    const start = end - WINDOW_MS;
    const arr = evByParticipant[r.participant_id] || [];
    let n = 0;
    let aiChars = 0;
    let humanChars = 0;
    for (const e of arr) {
      const t = new Date(e.ts).getTime();
      if (t >= start && t <= end) {
        n++;
        const pl = e.payload || {};
        if (e.event_type === "agent_edit" || e.event_type === "tab_edit")
          aiChars += Number(pl.added_chars) || 0;
        else if (e.event_type === "edit_insert") aiChars += Number(pl.added_chars) || 0;
        else if (e.event_type === "edit_burst") humanChars += Number(pl.added_chars) || 0;
      }
    }
    if (n > 0) esmWithEvents++;
    const denom = aiChars + humanChars;
    windowCounts.push({
      flow: r.flow_score,
      events_in_window: n,
      ai_mix: denom > 0 ? +(aiChars / denom).toFixed(3) : null,
    });
  }

  // ---- session coverage ----
  const evPerSession = {};
  for (const e of events) if (e.session_id) inc(evPerSession, e.session_id);
  const sessionDurations = sessions
    .filter((s) => s.started_at && s.ended_at)
    .map((s) => (new Date(s.ended_at) - new Date(s.started_at)) / 60000);

  const summary = {
    generated_at: new Date().toISOString(),
    project: URL_BASE,
    totals: {
      participants: participants.length,
      participants_withdrawn: withdrawn,
      sessions: sessions.length,
      events: events.length,
      esm_responses: esm.length,
    },
    participants: { by_platform: byPlatform, by_primary_ai_tool: byTool },
    events: {
      by_source: bySource,
      by_agent: byAgent,
      by_type: byType,
      per_participant: fiveNum(Object.values(eventsPerParticipant)),
      null_field_health: nullCheck,
    },
    ai_contribution_chars: {
      measured_hooks: measuredAiChars,
      estimated_inserts: estimatedAiChars,
      human_edit_bursts: humanEditChars,
    },
    esm: {
      flow_score: flow,
      frustration,
      confidence,
      by_trigger: byTrigger,
    },
    labeled_windows: {
      window_minutes: 15,
      total_labels: esm.length,
      labels_with_events: esmWithEvents,
      coverage_pct: esm.length ? +((100 * esmWithEvents) / esm.length).toFixed(1) : 0,
      events_in_window: fiveNum(windowCounts.map((w) => w.events_in_window)),
      sample: windowCounts.slice(0, 50),
    },
    sessions: {
      events_per_session: fiveNum(Object.values(evPerSession)),
      duration_minutes: fiveNum(sessionDurations),
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "pilot.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(DATA_DIR, "raw.json"),
    JSON.stringify({ participants, sessions, events, esm }, null, 2),
  );
  console.log(`[pull] wrote data/pilot.json and data/raw.json`);
  console.log(`[pull] labeled-window coverage: ${summary.labeled_windows.coverage_pct}% of ESM labels have events in the 15-min lookback`);
}

main().catch((e) => fail(String(e?.stack || e)));
