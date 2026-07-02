import * as vscode from "vscode";
import { Recorder } from "../recorder";

const DEBOUNCE_MS = 5_000;

// Records error/warning churn across the workspace. Counts only.
export function registerDiagnostics(recorder: Recorder): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  let debounce: NodeJS.Timeout | undefined;
  let lastErrors = -1;
  let lastWarnings = -1;

  const sample = () => {
    let errors = 0;
    let warnings = 0;
    for (const [, diags] of vscode.languages.getDiagnostics()) {
      for (const d of diags) {
        if (d.severity === vscode.DiagnosticSeverity.Error) errors += 1;
        else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings += 1;
      }
    }
    if (errors !== lastErrors || warnings !== lastWarnings) {
      recorder.record("diagnostics_churn", { error_count: errors, warning_count: warnings });
      lastErrors = errors;
      lastWarnings = warnings;
    }
  };

  disposables.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(sample, DEBOUNCE_MS);
    }),
  );
  disposables.push(new vscode.Disposable(() => debounce && clearTimeout(debounce)));

  return disposables;
}
