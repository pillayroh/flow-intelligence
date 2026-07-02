import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { log } from "./logger";

function existsSafe(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function quote(p: string): string {
  return p.includes(" ") ? `"${p}"` : p;
}

// Resolve a runtime command prefix for the forwarder. The forwarder uses only
// node:* built-ins, so it runs under Bun OR Node. We try, in order:
//   1. Bun (fast startup) at common absolute paths, then PATH.
//   2. Node at common absolute paths, then PATH.
//   3. Cursor's own bundled Node via Electron (ELECTRON_RUN_AS_NODE) — always
//      present, so participants need NO separate runtime installed.
// Absolute paths are preferred because the hook shell's PATH may be minimal.
function resolveRuntimePrefix(): string {
  const home = os.homedir();
  const direct = [
    path.join(home, ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const c of direct) {
    if (existsSafe(c)) return quote(c);
  }
  for (const bin of ["bun", "node"]) {
    try {
      const found = execSync(`command -v ${bin}`, { encoding: "utf8" }).trim();
      if (found) return quote(found);
    } catch { /* ignore */ }
  }
  // Last resort: run the extension host's own Node binary as a plain Node.
  return `ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)}`;
}

// The hook entries Flow Intelligence manages. Kept identical (in spirit) to
// hooks/hooks.template.json. Each is tagged so we can safely add/remove only
// our own entries without disturbing a participant's existing hooks.
const FI_TAG = "flow-intel";

interface HookEntry {
  command: string;
  matcher?: string;
  _fi?: string;
}
interface HooksFile {
  version: number;
  hooks: Record<string, HookEntry[]>;
}

function managedEntries(): Record<string, HookEntry[]> {
  const runtime = resolveRuntimePrefix();
  const cmd = (arg: string) => `${runtime} hooks/forwarder.mjs ${arg}`;
  return {
    beforeSubmitPrompt: [{ command: cmd("prompt"), matcher: "UserPromptSubmit", _fi: FI_TAG }],
    afterAgentResponse: [{ command: cmd("agent_response"), _fi: FI_TAG }],
    afterAgentThought: [{ command: cmd("agent_thought"), _fi: FI_TAG }],
    // afterFileEdit fires for Agent edits; no matcher so it catches every
    // agent-authored edit. Tab (inline completion) edits come through the
    // separate afterTabFileEdit hook, not afterFileEdit.
    afterFileEdit: [{ command: cmd("agent_edit"), _fi: FI_TAG }],
    afterTabFileEdit: [{ command: cmd("tab_edit"), _fi: FI_TAG }],
    preToolUse: [{ command: cmd("tool_pre"), _fi: FI_TAG }],
    postToolUse: [{ command: cmd("tool_post"), _fi: FI_TAG }],
    beforeShellExecution: [{ command: cmd("shell_pre"), _fi: FI_TAG }],
    afterShellExecution: [{ command: cmd("shell_post"), _fi: FI_TAG }],
    subagentStart: [{ command: cmd("subagent_start"), _fi: FI_TAG }],
    subagentStop: [{ command: cmd("subagent_stop"), _fi: FI_TAG }],
    stop: [{ command: cmd("stop"), _fi: FI_TAG }],
    preCompact: [{ command: cmd("compact"), _fi: FI_TAG }],
    sessionStart: [{ command: cmd("session_start"), _fi: FI_TAG }],
    sessionEnd: [{ command: cmd("session_end"), _fi: FI_TAG }],
  };
}

function cursorDir(): string {
  return path.join(os.homedir(), ".cursor");
}

// Copies the bundled forwarder into ~/.cursor/hooks/ and merges our hook
// entries into ~/.cursor/hooks.json, preserving any pre-existing hooks.
export function installHooks(ctx: vscode.ExtensionContext): void {
  const hooksDir = path.join(cursorDir(), "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const src = path.join(ctx.extensionPath, "resources", "forwarder.mjs");
  const dest = path.join(hooksDir, "forwarder.mjs");
  try {
    fs.copyFileSync(src, dest);
  } catch (err) {
    log(`failed to copy forwarder.mjs: ${String(err)}`);
  }

  const hooksJsonPath = path.join(cursorDir(), "hooks.json");
  const file = readHooks(hooksJsonPath);
  mergeManaged(file, managedEntries());
  writeHooks(hooksJsonPath, file);
  log("hooks installed/merged");
}

// Removes only Flow Intelligence entries, leaving other hooks intact.
export function uninstallHooks(): void {
  const hooksJsonPath = path.join(cursorDir(), "hooks.json");
  if (!fs.existsSync(hooksJsonPath)) return;
  const file = readHooks(hooksJsonPath);
  for (const event of Object.keys(file.hooks)) {
    file.hooks[event] = (file.hooks[event] ?? []).filter((e) => e._fi !== FI_TAG);
    if (file.hooks[event].length === 0) delete file.hooks[event];
  }
  writeHooks(hooksJsonPath, file);
  log("hooks uninstalled");
}

function readHooks(p: string): HooksFile {
  try {
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      if (parsed && typeof parsed === "object") {
        return { version: parsed.version ?? 1, hooks: parsed.hooks ?? {} };
      }
    }
  } catch (err) {
    log(`could not parse existing hooks.json, starting fresh: ${String(err)}`);
  }
  return { version: 1, hooks: {} };
}

function mergeManaged(file: HooksFile, managed: Record<string, HookEntry[]>): void {
  for (const [event, entries] of Object.entries(managed)) {
    const existing = file.hooks[event] ?? [];
    const withoutOurs = existing.filter((e) => e._fi !== FI_TAG);
    file.hooks[event] = [...withoutOurs, ...entries];
  }
}

function writeHooks(p: string, file: HooksFile): void {
  try {
    fs.writeFileSync(p, JSON.stringify(file, null, 2), "utf8");
  } catch (err) {
    log(`failed to write hooks.json: ${String(err)}`);
  }
}
