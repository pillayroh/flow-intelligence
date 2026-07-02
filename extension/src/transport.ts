import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { EsmResponse, SessionInfo, TelemetryEvent } from "./types";
import { getSettings, ingestUrl, ParticipantStore } from "./config";
import { postJson } from "./http";
import { log } from "./logger";
import { StatsHub } from "./stats";

const MAX_BATCH = 200;
const MAX_BUFFER = 5000;

export class Transport {
  private events: TelemetryEvent[] = [];
  private esm: EsmResponse[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushing = false;
  private readonly bufferFile: string;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ParticipantStore,
    private readonly getSession: () => SessionInfo | null,
    private readonly stats: StatsHub,
  ) {
    this.bufferFile = path.join(ctx.globalStorageUri.fsPath, "buffer.json");
  }

  start(): void {
    try {
      fs.mkdirSync(this.ctx.globalStorageUri.fsPath, { recursive: true });
    } catch { /* ignore */ }
    this.loadBuffer();
    const intervalMs = getSettings().flushIntervalSeconds * 1000;
    this.timer = setInterval(() => void this.flush(), intervalMs);
  }

  enqueue(event: TelemetryEvent): void {
    // Feed the live dashboard regardless of upload state.
    this.stats.observe(event);
    if (!this.store.enabled) return;
    this.events.push(event);
    if (this.events.length > MAX_BUFFER) this.events.splice(0, this.events.length - MAX_BUFFER);
  }

  enqueueEsm(resp: EsmResponse): void {
    this.stats.observeEsm(resp);
    // ESM labels are precious; keep them even if collection is paused.
    this.esm.push(resp);
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.events.length === 0 && this.esm.length === 0) return;

    const token = await this.store.getToken();
    const settings = getSettings();
    if (!token || !settings.supabaseUrl) return;

    this.flushing = true;
    const eventsBatch = this.events.slice(0, MAX_BATCH);
    const esmBatch = this.esm.slice(0, MAX_BATCH);
    const session = this.getSession();

    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (settings.supabaseAnonKey) headers["apikey"] = settings.supabaseAnonKey;

      const res = await postJson(
        ingestUrl(settings),
        {
          session: session
            ? {
                session_id: session.session_id,
                started_at: session.started_at,
                ended_at: session.ended_at,
                editor_version: session.editor_version,
              }
            : undefined,
          events: eventsBatch,
          esm: esmBatch,
        },
        headers,
      );

      if (res.status >= 200 && res.status < 300) {
        this.events.splice(0, eventsBatch.length);
        this.esm.splice(0, esmBatch.length);
        this.persistBuffer();
      } else {
        log(`ingest non-2xx: ${res.status} ${res.body.slice(0, 200)}`);
        this.persistBuffer();
      }
    } catch (err) {
      log(`ingest failed, buffering: ${String(err)}`);
      this.persistBuffer();
    } finally {
      this.flushing = false;
    }
  }

  private persistBuffer(): void {
    try {
      fs.writeFileSync(
        this.bufferFile,
        JSON.stringify({ events: this.events, esm: this.esm }),
        "utf8",
      );
    } catch (err) {
      log(`failed to persist buffer: ${String(err)}`);
    }
  }

  private loadBuffer(): void {
    try {
      if (!fs.existsSync(this.bufferFile)) return;
      const data = JSON.parse(fs.readFileSync(this.bufferFile, "utf8"));
      if (Array.isArray(data.events)) this.events = data.events;
      if (Array.isArray(data.esm)) this.esm = data.esm;
    } catch (err) {
      log(`failed to load buffer: ${String(err)}`);
    }
  }

  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    this.persistBuffer();
  }
}
