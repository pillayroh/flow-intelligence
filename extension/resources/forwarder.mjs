#!/usr/bin/env bun
/*
 * Flow Intelligence hook forwarder.
 *
 * Invoked by Cursor hooks as:  bun hooks/forwarder.mjs <eventType>
 * (paths in user-level hooks are relative to ~/.cursor).
 *
 * Reads the hook event JSON on stdin, reduces it to METADATA ONLY (lengths,
 * counts, categories — never prompt text, code, file contents, or raw
 * commands), and POSTs it to the ingest endpoint using the participant's
 * token from ~/.cursor/flow-intel/config.json.
 *
 * Runtime: Bun (uses only node:* built-ins, which Bun supports).
 *
 * Design rules:
 *  - No external dependencies (built-in modules only).
 *  - ALWAYS fail open: any error exits 0 and never blocks the user's action.
 *  - Never print anything to stdout for "before*" events (empty output = allow).
 */

import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import https from "node:https";
import http from "node:http";

const CONFIG_PATH = join(homedir(), ".cursor", "flow-intel", "config.json");
const DEBUG_LOG = join(homedir(), ".cursor", "flow-intel", "forwarder.log");

main().catch(() => process.exit(0));

async function main() {
  const eventType = process.argv[2] || "unknown";
  // Second arg tags which agent produced the event (e.g. "cursor",
  // "claude_code"). Defaults to cursor for backward compatibility.
  const agent = process.argv[3] || "cursor";
  const raw = readStdin();
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  const config = readConfig();
  // If not enrolled / disabled, do nothing (but never block).
  if (!config || config.enabled === false || !config.ingest_url || !config.token) {
    return exitAllow();
  }

  if (config.debug) {
    // Log only the KEY NAMES present, never values — helps confirm the hook
    // input schema during the dogfooding phase without capturing content.
    try {
      appendFileSync(
        DEBUG_LOG,
        `${new Date().toISOString()} ${eventType} keys=${Object.keys(input).join(",")}\n`,
      );
    } catch { /* ignore */ }
  }

  const payload = buildPayload(eventType, input);
  payload.agent = agent;

  const event = {
    ts: new Date().toISOString(),
    source: "hook",
    event_type: eventType,
    session_id: config.session_id || null,
    payload,
  };

  await postEvents(config, [event]).catch(() => {});
  return exitAllow();
}

/* --------------------------------------------------------------------------
 * Metadata extraction: pull only numbers / short categories per event type.
 * ------------------------------------------------------------------------ */
function buildPayload(eventType, input) {
  switch (eventType) {
    case "prompt":
      return {
        prompt_length: strLen(pick(input, ["prompt", "text", "message", "input"])),
        attachment_count: arrLen(pick(input, ["attachments", "files", "context"])),
      };
    case "agent_response":
    case "agent_thought":
      return {
        text_length: strLen(pick(input, ["text", "content", "message", "response", "thought"])),
      };
    case "agent_edit":
    case "tab_edit":
      return editPayload(input);
    case "tool_pre":
    case "tool_post":
      return {
        tool_name: shortStr(pick(input, ["tool", "tool_name", "toolName", "name"])),
        success: boolOrNull(pick(input, ["success", "ok"])),
      };
    case "shell_pre":
    case "shell_post":
      return {
        command_class: classifyCommand(pick(input, ["command", "cmd", "commandLine"])),
        exit_code: numOrNull(pick(input, ["exit_code", "exitCode", "code"])),
      };
    case "subagent_start":
    case "subagent_stop":
      return {
        subagent_type: shortStr(pick(input, ["subagent_type", "subagentType", "type", "agent"])),
      };
    case "stop":
    case "compact":
    case "session_start":
    case "session_end":
    default:
      return {};
  }
}

/* --------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

// Character-only accounting of an AI file edit (never the text itself), so the
// dashboard can attribute AI-written vs human-written code. Handles two shapes:
//   - Cursor afterFileEdit / afterTabFileEdit: { file_path, edits:[{old_string,new_string}] }
//   - Claude Code PostToolUse: { tool_name, tool_input:{ file_path, old_string,
//     new_string | content | edits:[...] } }  (Edit / Write / MultiEdit tools)
function editPayload(input) {
  const ti = input && typeof input.tool_input === "object" && input.tool_input ? input.tool_input : null;
  const src = ti || input;
  let added = 0;
  let removed = 0;
  let count = 0;
  const edits = pick(src, ["edits", "changes", "hunks"]);
  if (Array.isArray(edits)) {
    count = edits.length;
    for (const e of edits) {
      if (e && typeof e === "object") {
        if (typeof e.new_string === "string") added += e.new_string.length;
        if (typeof e.old_string === "string") removed += e.old_string.length;
        if (typeof e.new_line === "string") added += e.new_line.length;
        if (typeof e.old_line === "string") removed += e.old_line.length;
      }
    }
  } else {
    const ns = pick(src, ["new_string", "new_text"]);
    const os2 = pick(src, ["old_string", "old_text"]);
    const content = pick(src, ["content", "contents", "file_text"]);
    if (typeof ns === "string") {
      added += ns.length;
      count = 1;
    }
    if (typeof os2 === "string") removed += os2.length;
    if (added === 0 && typeof content === "string") {
      added += content.length;
      count = 1;
    }
  }
  return {
    file_ext: fileExt(pick(src, ["file_path", "path", "file", "filePath", "uri"])),
    added_chars: added,
    removed_chars: removed,
    edit_count: count || 1,
  };
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  // one level deep (some hooks nest under a payload/data/tool_input field)
  for (const nestKey of ["payload", "data", "input", "event", "tool_input"]) {
    const nested = obj[nestKey];
    if (nested && typeof nested === "object") {
      for (const k of keys) {
        if (nested[k] !== undefined) return nested[k];
      }
    }
  }
  return undefined;
}

function strLen(v) {
  return typeof v === "string" ? v.length : null;
}
function arrLen(v) {
  return Array.isArray(v) ? v.length : null;
}
function sumLen(v) {
  if (typeof v === "string") return v.length;
  if (Array.isArray(v)) {
    return v.reduce((acc, x) => acc + (typeof x === "string" ? x.length : 0), 0);
  }
  return null;
}
function fileExt(v) {
  if (typeof v !== "string") return null;
  const clean = v.split(/[?#]/)[0];
  const base = clean.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase().slice(0, 20) : null;
}
function shortStr(v) {
  return typeof v === "string" ? v.slice(0, 60) : null;
}
function boolOrNull(v) {
  return typeof v === "boolean" ? v : null;
}
function numOrNull(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}
function classifyCommand(v) {
  if (typeof v !== "string") return null;
  const c = v.trim().toLowerCase();
  if (/\b(test|pytest|jest|vitest|go test|cargo test|rspec|mocha)\b/.test(c)) return "test";
  if (/\b(npm|pnpm|yarn|pip|poetry|cargo|go|brew|apt) (install|add|i)\b/.test(c)) return "install";
  if (/^git\b/.test(c)) return "git";
  if (/\b(npm|pnpm|yarn) (run |start|dev|build)|python |node |go run|cargo run|make\b/.test(c)) return "run";
  if (/\b(ls|cd|cat|echo|pwd|grep|rg|find|mkdir|rm|cp|mv)\b/.test(c)) return "shell";
  return "other";
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function postEvents(config, events) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.ingest_url);
    const lib = url.protocol === "http:" ? http : https;
    const body = JSON.stringify({ events });
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Authorization: `Bearer ${config.token}`,
    };
    if (config.apikey) headers["apikey"] = config.apikey;

    const req = lib.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: url.pathname + url.search,
        headers,
        timeout: 4000,
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(body);
    req.end();
  });
}

function exitAllow() {
  // For observe-only hooks, no stdout is needed. For "before*" hooks, empty
  // output means "allow" by default, which is exactly what we want.
  process.exit(0);
}
