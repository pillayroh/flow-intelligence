import * as vscode from "vscode";
import { Recorder } from "../recorder";
import { SessionManager } from "../session";
import { registerBehavioral } from "./behavioral";
import { registerGit } from "./git";
import { registerDiagnostics } from "./diagnostics";

export function registerTelemetry(
  recorder: Recorder,
  sessions: SessionManager,
): vscode.Disposable[] {
  return [
    ...registerBehavioral(recorder, sessions),
    ...registerGit(recorder),
    ...registerDiagnostics(recorder),
  ];
}
