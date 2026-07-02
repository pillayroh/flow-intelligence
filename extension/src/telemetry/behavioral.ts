import * as vscode from "vscode";
import * as path from "node:path";
import { Recorder } from "../recorder";
import { SessionManager } from "../session";

const EDIT_FLUSH_MS = 15_000;

// Edit-provenance heuristic (tool-agnostic; works in any VS Code-based editor,
// including plain VS Code + Copilot where no AI hook exists). A single content
// change that inserts a large, atomic block is unlikely to be human keystrokes
// (each keystroke is its own tiny change) and is characteristic of a completion
// acceptance, agent write, or paste. We emit RAW signals only and never
// classify hard here — analysis decides using added_chars, line_count,
// replaced_chars, and since_last_ms. This is NOT summed into the measured
// AI/human bar (which uses agent_edit/tab_edit hooks); it's a research estimate.
const LARGE_INSERT_MIN_CHARS = 40;

// Editor focus switches, window focus, and typing/edit bursts.
// Only sizes, counts, languages, and file extensions are recorded - never text.
export function registerBehavioral(
  recorder: Recorder,
  sessions: SessionManager,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      sessions.markActivity();
      recorder.record("focus_switch", {
        language: editor?.document.languageId ?? null,
        file_ext: editor ? fileExt(editor.document) : null,
      });
    }),
  );

  disposables.push(
    vscode.window.onDidChangeWindowState((state) => {
      recorder.record("window_focus", { focused: state.focused });
    }),
  );

  // Edit-burst accumulator.
  let added = 0;
  let removed = 0;
  let changeCount = 0;
  let language: string | null = null;
  let burstStart = 0;

  const flushBurst = () => {
    if (changeCount === 0) return;
    recorder.record("edit_burst", {
      added_chars: added,
      removed_chars: removed,
      change_count: changeCount,
      span_ms: burstStart ? Date.now() - burstStart : 0,
      language,
    });
    added = 0;
    removed = 0;
    changeCount = 0;
    burstStart = 0;
  };

  let lastChangeAt = 0;

  disposables.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme !== "file") return;
      sessions.markActivity();
      if (burstStart === 0) burstStart = Date.now();
      language = e.document.languageId;

      const now = Date.now();
      const sinceLast = lastChangeAt ? now - lastChangeAt : null;
      lastChangeAt = now;

      // Undo/redo are not authored content; keep them out of provenance signals.
      const authored =
        e.reason !== vscode.TextDocumentChangeReason.Undo &&
        e.reason !== vscode.TextDocumentChangeReason.Redo;

      for (const change of e.contentChanges) {
        added += change.text.length;
        removed += change.rangeLength;
        changeCount += 1;

        if (authored && change.text.length >= LARGE_INSERT_MIN_CHARS) {
          const newlines = countNewlines(change.text);
          recorder.record("edit_insert", {
            added_chars: change.text.length,
            replaced_chars: change.rangeLength,
            line_count: newlines + 1,
            since_last_ms: sinceLast,
            language: e.document.languageId,
            file_ext: fileExt(e.document),
          });
        }
      }
    }),
  );

  const timer = setInterval(flushBurst, EDIT_FLUSH_MS);
  disposables.push(new vscode.Disposable(() => clearInterval(timer)));

  return disposables;
}

function fileExt(doc: vscode.TextDocument): string | null {
  const ext = path.extname(doc.fileName).replace(/^\./, "").toLowerCase();
  return ext.length ? ext.slice(0, 20) : null;
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) n++;
  }
  return n;
}
