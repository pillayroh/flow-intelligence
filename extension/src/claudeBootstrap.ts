import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { forwarderPath, quoteRuntimePath, resolveRuntimePrefix } from "./hooksBootstrap";
import { log } from "./logger";

// Claude Code is a separate agent with its own hook system (~/.claude/settings.json).
// It uses a different config shape than Cursor: each event maps to an array of
// matcher groups, and each group has a `hooks` array of { type, command }.
// We install the SAME forwarder (absolute path), tagging events with the
// "claude_code" agent so the backend/dashboard can attribute them correctly.

interface ClaudeHookCmd {
  type: "command";
  command: string;
}
interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeHookCmd[];
}
type ClaudeHooks = Record<string, ClaudeHookGroup[]>;

function claudeDir(): string {
  return path.join(os.homedir(), ".claude");
}
function claudeSettingsPath(): string {
  return path.join(claudeDir(), "settings.json");
}

function managedClaudeHooks(): ClaudeHooks {
  const runtime = resolveRuntimePrefix();
  const fwd = quoteRuntimePath(forwarderPath());
  const cmd = (arg: string) => `${runtime} ${fwd} ${arg} claude_code`;
  return {
    UserPromptSubmit: [{ hooks: [{ type: "command", command: cmd("prompt") }] }],
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: cmd("shell_pre") }] },
      { hooks: [{ type: "command", command: cmd("tool_pre") }] },
    ],
    PostToolUse: [
      { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: cmd("agent_edit") }] },
    ],
    Stop: [{ hooks: [{ type: "command", command: cmd("stop") }] }],
  };
}

function groupIsOurs(group: ClaudeHookGroup, fwd: string): boolean {
  return Array.isArray(group?.hooks)
    && group.hooks.some((h) => typeof h?.command === "string" && h.command.includes(fwd));
}

// Installs/refreshes our Claude Code hooks, preserving any user-defined ones.
// No-op (skips) when Claude Code isn't present, to avoid creating stray config.
export function installClaudeHooks(): void {
  try {
    if (!fs.existsSync(claudeDir())) {
      log("claude code not detected (~/.claude absent); skipping claude hooks");
      return;
    }
    const p = claudeSettingsPath();
    const settings = readJson(p) ?? {};
    const hooks: ClaudeHooks =
      settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};

    const fwd = forwarderPath();
    const managed = managedClaudeHooks();
    for (const [event, groups] of Object.entries(managed)) {
      const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
      const withoutOurs = existing.filter((g) => !groupIsOurs(g, fwd));
      hooks[event] = [...withoutOurs, ...groups];
    }
    settings.hooks = hooks;
    writeJson(p, settings);
    log("claude code hooks installed/merged");
  } catch (err) {
    log(`claude hooks install failed: ${String(err)}`);
  }
}

// Removes only our entries, leaving the participant's own Claude hooks intact.
export function uninstallClaudeHooks(): void {
  try {
    const p = claudeSettingsPath();
    if (!fs.existsSync(p)) return;
    const settings = readJson(p);
    if (!settings || typeof settings.hooks !== "object") return;
    const hooks: ClaudeHooks = settings.hooks;
    const fwd = forwarderPath();
    for (const event of Object.keys(hooks)) {
      hooks[event] = (hooks[event] ?? []).filter((g) => !groupIsOurs(g, fwd));
      if (hooks[event].length === 0) delete hooks[event];
    }
    settings.hooks = hooks;
    writeJson(p, settings);
    log("claude code hooks uninstalled");
  } catch (err) {
    log(`claude hooks uninstall failed: ${String(err)}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson(p: string): any | null {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    log(`could not parse ${p}: ${String(err)}`);
  }
  return null;
}

function writeJson(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}
