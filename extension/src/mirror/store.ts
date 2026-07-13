import * as vscode from "vscode";
import { MirrorInput } from "./archetype";

// Local, private rolling store of per-day behavioral aggregates that powers the
// AI Collaboration Mirror. Persisted to globalState only (never uploaded, never
// leaves the machine). Holds counts/sizes only — no code, prompts, or paths.
//
// This exists so the mirror can reflect a trailing window (e.g. 7 days) rather
// than a single editor process, which resets on every launch.

interface DayAgg {
  aiInsertChars: number;
  humanTypedChars: number;
  humanRemovedChars: number;
  focusSwitches: number;
  activeMs: number;
  commits: number;
  languages: Record<string, number>;
}

const KEY = "flowIntel.mirror.daily";
const KEEP_DAYS = 60;
const PERSIST_DEBOUNCE_MS = 5_000;

function emptyDay(): DayAgg {
  return {
    aiInsertChars: 0,
    humanTypedChars: 0,
    humanRemovedChars: 0,
    focusSwitches: 0,
    activeMs: 0,
    commits: 0,
    languages: {},
  };
}

export class MirrorStore {
  private data: Record<string, DayAgg>;
  private persistTimer: NodeJS.Timeout | undefined;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.data = ctx.globalState.get<Record<string, DayAgg>>(KEY) ?? {};
    this.prune();
  }

  private dayKey(d = new Date()): string {
    return d.toISOString().slice(0, 10);
  }

  private today(): DayAgg {
    const k = this.dayKey();
    return (this.data[k] ??= emptyDay());
  }

  addTyped(chars: number, removed: number, language: unknown): void {
    const day = this.today();
    if (chars > 0) day.humanTypedChars += chars;
    if (removed > 0) day.humanRemovedChars += removed;
    if (typeof language === "string" && language && chars > 0) {
      day.languages[language] = (day.languages[language] ?? 0) + chars;
    }
    this.schedulePersist();
  }

  addAiInsert(chars: number): void {
    if (chars > 0) this.today().aiInsertChars += chars;
    this.schedulePersist();
  }

  addFocusSwitch(): void {
    this.today().focusSwitches += 1;
    this.schedulePersist();
  }

  addActive(ms: number): void {
    if (ms > 0) this.today().activeMs += ms;
    this.schedulePersist();
  }

  addCommit(): void {
    this.today().commits += 1;
    this.schedulePersist();
  }

  // Aggregate the most recent `days` calendar days into a MirrorInput.
  getInput(days = 7): MirrorInput {
    const cutoff = this.dayKey(new Date(Date.now() - (days - 1) * 86_400_000));
    let aiInsertChars = 0;
    let humanTypedChars = 0;
    let humanRemovedChars = 0;
    let focusSwitches = 0;
    let activeMs = 0;
    let commits = 0;
    const languages: Record<string, number> = {};
    let daysObserved = 0;

    for (const [date, agg] of Object.entries(this.data)) {
      if (date < cutoff) continue;
      const active =
        agg.aiInsertChars + agg.humanTypedChars + agg.focusSwitches + agg.commits > 0;
      if (active) daysObserved += 1;
      aiInsertChars += agg.aiInsertChars;
      humanTypedChars += agg.humanTypedChars;
      humanRemovedChars += agg.humanRemovedChars;
      focusSwitches += agg.focusSwitches;
      activeMs += agg.activeMs;
      commits += agg.commits;
      for (const [lang, c] of Object.entries(agg.languages)) {
        languages[lang] = (languages[lang] ?? 0) + c;
      }
    }

    let topLanguage: string | null = null;
    let topChars = 0;
    for (const [lang, c] of Object.entries(languages)) {
      if (c > topChars) {
        topChars = c;
        topLanguage = lang;
      }
    }

    return {
      aiInsertChars,
      humanTypedChars,
      humanRemovedChars,
      focusSwitches,
      activeMinutes: activeMs / 60_000,
      commits,
      topLanguage,
      daysObserved,
    };
  }

  private prune(): void {
    const cutoff = this.dayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
    let changed = false;
    for (const date of Object.keys(this.data)) {
      if (date < cutoff) {
        delete this.data[date];
        changed = true;
      }
    }
    if (changed) void this.ctx.globalState.update(KEY, this.data);
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.ctx.globalState.update(KEY, this.data);
    }, PERSIST_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    void this.ctx.globalState.update(KEY, this.data);
  }
}
