import * as vscode from "vscode";
import { EsmResponse, TelemetryEvent } from "./types";
import { MirrorStore } from "./mirror/store";

export interface LiveSnapshot {
  by_type: Record<string, number>;
  human: {
    edit_bursts: number;
    added_chars: number;
    removed_chars: number;
    focus_switches: number;
    commits: number;
  };
  // Estimated AI contribution from the tool-agnostic edit_insert signal (large
  // atomic insertions). Available locally without hooks; used by the Mirror.
  ai_estimate: {
    inserts: number;
    added_chars: number;
  };
  languages: Record<string, number>; // added_chars by language (for "top language")
  last_esm: EsmResponse | null;
  updated_at: string;
}

// Real-time, in-memory aggregate of behavioral events observed this process.
// AI-interaction totals come from the server summary (hooks bypass the
// extension), so the dashboard merges this live snapshot with the summary.
export class StatsHub {
  private byType: Record<string, number> = {};
  private human = {
    edit_bursts: 0,
    added_chars: 0,
    removed_chars: 0,
    focus_switches: 0,
    commits: 0,
  };
  private aiEstimate = { inserts: 0, added_chars: 0 };
  private languages: Record<string, number> = {};
  private lastEsm: EsmResponse | null = null;

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private throttle: NodeJS.Timeout | undefined;

  // The optional mirror store persists these signals across sessions so the
  // Mirror can reflect a trailing multi-day window.
  constructor(private readonly mirror?: MirrorStore) {}

  observe(event: TelemetryEvent): void {
    this.byType[event.event_type] = (this.byType[event.event_type] ?? 0) + 1;
    const p = event.payload as Record<string, number>;
    switch (event.event_type) {
      case "edit_burst":
        this.human.edit_bursts += 1;
        this.human.added_chars += n(p.added_chars);
        this.human.removed_chars += n(p.removed_chars);
        this.addLanguage(event.payload.language, n(p.added_chars));
        this.mirror?.addTyped(n(p.added_chars), n(p.removed_chars), event.payload.language);
        break;
      case "edit_insert":
        this.aiEstimate.inserts += 1;
        this.aiEstimate.added_chars += n(p.added_chars);
        this.mirror?.addAiInsert(n(p.added_chars));
        break;
      case "focus_switch":
        this.human.focus_switches += 1;
        this.mirror?.addFocusSwitch();
        break;
      case "git_commit":
        this.human.commits += 1;
        this.mirror?.addCommit();
        break;
    }
    this.fire();
  }

  private addLanguage(lang: unknown, chars: number): void {
    if (typeof lang !== "string" || !lang || chars <= 0) return;
    this.languages[lang] = (this.languages[lang] ?? 0) + chars;
  }

  observeEsm(resp: EsmResponse): void {
    this.lastEsm = resp;
    this.fire();
  }

  snapshot(): LiveSnapshot {
    return {
      by_type: { ...this.byType },
      human: { ...this.human },
      ai_estimate: { ...this.aiEstimate },
      languages: { ...this.languages },
      last_esm: this.lastEsm,
      updated_at: new Date().toISOString(),
    };
  }

  private fire(): void {
    if (this.throttle) return;
    this.throttle = setTimeout(() => {
      this.throttle = undefined;
      this.emitter.fire();
    }, 800);
  }

  dispose(): void {
    if (this.throttle) clearTimeout(this.throttle);
    this.emitter.dispose();
  }
}

function n(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}
