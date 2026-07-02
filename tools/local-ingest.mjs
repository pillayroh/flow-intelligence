#!/usr/bin/env node
/*
 * Local ingest receiver for dogfooding the pipeline WITHOUT deploying Supabase.
 *
 * Usage:
 *   node tools/local-ingest.mjs            # listens on http://127.0.0.1:8787
 *
 * Then point the clients at it:
 *   - Extension: set flowIntel.supabaseUrl = http://127.0.0.1:8787  (it will
 *     call /functions/v1/enroll and /functions/v1/ingest)
 *   - Or set ~/.cursor/flow-intel/config.json ingest_url to
 *     http://127.0.0.1:8787/functions/v1/ingest with any token.
 *
 * It emulates just enough of enroll + ingest to confirm events/labels arrive,
 * prints a live summary, and appends raw batches to tools/local-ingest.log.
 */
import http from "node:http";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const LOG = new URL("./local-ingest.log", import.meta.url).pathname;

const counts = new Map();
let esmTotal = 0;
// Live aggregates so /summary can drive the dashboard during local dogfooding.
const agg = {
  sessions: new Set(),
  ai: { prompts: 0, messages: 0, agent_edits: 0, tab_edits: 0, tool_uses: 0, verifications: 0 },
  human: { edit_bursts: 0, commits: 0, focus_switches: 0 },
  aiChars: 0,
  humanChars: 0,
  esm: [],
};

function absorb(events, esm, session) {
  if (session?.session_id) agg.sessions.add(session.session_id);
  for (const e of events) {
    const p = e.payload ?? {};
    switch (e.event_type) {
      case "prompt": agg.ai.prompts++; break;
      case "agent_response":
      case "agent_thought": agg.ai.messages++; break;
      case "agent_edit": agg.ai.agent_edits++; agg.aiChars += p.added_chars ?? 0; break;
      case "tab_edit": agg.ai.tab_edits++; agg.aiChars += p.added_chars ?? 0; break;
      case "tool_pre": agg.ai.tool_uses++; break;
      case "shell_pre": if (p.command_class === "test") agg.ai.verifications++; break;
      case "edit_burst": agg.human.edit_bursts++; agg.humanChars += p.added_chars ?? 0; break;
      case "git_commit": agg.human.commits++; break;
      case "focus_switch": agg.human.focus_switches++; break;
    }
  }
  for (const r of esm) agg.esm.push(r);
}

function buildSummary() {
  const total = agg.aiChars + agg.humanChars;
  return {
    participant_id: "local-dogfood",
    persona: null,
    since: new Date().toISOString(),
    totals: { events: [...counts.values()].reduce((a, b) => a + b, 0), sessions: agg.sessions.size, active_ms: 0 },
    ai: agg.ai,
    human: agg.human,
    collaboration: { ai_chars: agg.aiChars, human_chars: agg.humanChars, ai_ratio: total ? agg.aiChars / total : 0 },
    by_type: Object.fromEntries(counts),
    esm: agg.esm.slice(-100),
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return end(res, 200, { ok: true });
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let json = {};
    try {
      json = body ? JSON.parse(body) : {};
    } catch {
      return end(res, 400, { error: "invalid_json" });
    }

    if (req.url.endsWith("/enroll")) {
      const token = randomUUID().replace(/-/g, "");
      console.log(`[enroll] study_code=${json.study_code} -> token issued`);
      return end(res, 200, { participant_id: randomUUID(), ingest_token: token });
    }

    if (req.url.endsWith("/ingest")) {
      const events = Array.isArray(json.events) ? json.events : [];
      const esm = Array.isArray(json.esm) ? json.esm : [];
      for (const e of events) counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
      esmTotal += esm.length;
      absorb(events, esm, json.session);
      appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), body: json }) + "\n");
      printSummary(events.length, esm.length);
      return end(res, 200, { events_inserted: events.length, esm_inserted: esm.length });
    }

    if (req.url.endsWith("/summary")) {
      return end(res, 200, buildSummary());
    }

    return end(res, 404, { error: "not_found" });
  });
});

function end(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  });
  res.end(JSON.stringify(obj));
}

function printSummary(nEvents, nEsm) {
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `[ingest] +${nEvents} events, +${nEsm} esm | esm_total=${esmTotal} | by_type: ` +
      top.map(([k, v]) => `${k}=${v}`).join(" "),
  );
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Flow Intelligence local ingest listening on http://127.0.0.1:${PORT}`);
  console.log(`Logging raw batches to ${LOG}`);
});
