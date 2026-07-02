import * as vscode from "vscode";
import * as path from "node:path";
import { Recorder } from "../recorder";
import { SessionManager } from "../session";

const EDIT_FLUSH_MS = 15_000;

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

  disposables.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme !== "file") return;
      sessions.markActivity();
      if (burstStart === 0) burstStart = Date.now();
      language = e.document.languageId;
      for (const change of e.contentChanges) {
        added += change.text.length;
        removed += change.rangeLength;
        changeCount += 1;
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
