import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ForwarderConfig } from "./types";
import { log } from "./logger";

export const CONSENT_VERSION = "1.0";

const TOKEN_SECRET_KEY = "flowIntel.ingestToken";
const PARTICIPANT_ID_KEY = "flowIntel.participantId";
const ENABLED_KEY = "flowIntel.enabled";

export interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  esmMinActiveMinutes: number;
  esmMaxActiveMinutes: number;
  esmDailyCap: number;
  idleThresholdMinutes: number;
  flushIntervalSeconds: number;
}

export function getSettings(): Settings {
  const c = vscode.workspace.getConfiguration("flowIntel");
  return {
    supabaseUrl: (c.get<string>("supabaseUrl") ?? "").replace(/\/+$/, ""),
    supabaseAnonKey: c.get<string>("supabaseAnonKey") ?? "",
    esmMinActiveMinutes: c.get<number>("esm.minActiveMinutes") ?? 30,
    esmMaxActiveMinutes: c.get<number>("esm.maxActiveMinutes") ?? 90,
    esmDailyCap: c.get<number>("esm.dailyCap") ?? 8,
    idleThresholdMinutes: c.get<number>("idleThresholdMinutes") ?? 5,
    flushIntervalSeconds: c.get<number>("flushIntervalSeconds") ?? 30,
  };
}

export function enrollUrl(s: Settings): string {
  return `${s.supabaseUrl}/functions/v1/enroll`;
}
export function ingestUrl(s: Settings): string {
  return `${s.supabaseUrl}/functions/v1/ingest`;
}
export function summaryUrl(s: Settings): string {
  return `${s.supabaseUrl}/functions/v1/summary`;
}

export function flowIntelDir(): string {
  return path.join(os.homedir(), ".cursor", "flow-intel");
}
export function forwarderConfigPath(): string {
  return path.join(flowIntelDir(), "config.json");
}

export function writeForwarderConfig(cfg: ForwarderConfig): void {
  try {
    fs.mkdirSync(flowIntelDir(), { recursive: true });
    fs.writeFileSync(forwarderConfigPath(), JSON.stringify(cfg, null, 2), "utf8");
  } catch (err) {
    log(`failed to write forwarder config: ${String(err)}`);
  }
}

export function patchForwarderConfig(patch: Partial<ForwarderConfig>): void {
  try {
    const p = forwarderConfigPath();
    if (!fs.existsSync(p)) return;
    const current = JSON.parse(fs.readFileSync(p, "utf8")) as ForwarderConfig;
    const next = { ...current, ...patch };
    fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    log(`failed to patch forwarder config: ${String(err)}`);
  }
}

// ---- Participant identity / enrollment state -----------------------------
export class ParticipantStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  async getToken(): Promise<string | undefined> {
    return this.ctx.secrets.get(TOKEN_SECRET_KEY);
  }
  async setToken(token: string): Promise<void> {
    await this.ctx.secrets.store(TOKEN_SECRET_KEY, token);
  }
  async clearToken(): Promise<void> {
    await this.ctx.secrets.delete(TOKEN_SECRET_KEY);
  }

  get participantId(): string | undefined {
    return this.ctx.globalState.get<string>(PARTICIPANT_ID_KEY);
  }
  async setParticipantId(id: string): Promise<void> {
    await this.ctx.globalState.update(PARTICIPANT_ID_KEY, id);
  }

  get enabled(): boolean {
    return this.ctx.globalState.get<boolean>(ENABLED_KEY) ?? true;
  }
  async setEnabled(v: boolean): Promise<void> {
    await this.ctx.globalState.update(ENABLED_KEY, v);
  }

  async isEnrolled(): Promise<boolean> {
    return !!this.participantId && !!(await this.getToken());
  }
}
