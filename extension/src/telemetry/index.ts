import * as vscode from "vscode";
import { Recorder } from "../recorder";
import { SessionManager } from "../session";
import { StatsHub } from "../stats";
import { registerBehavioral } from "./behavioral";
import { registerGit } from "./git";
import { registerDiagnostics } from "./diagnostics";

export function registerTelemetry(
  recorder: Recorder,
  sessions: SessionManager,
  stats: StatsHub,
): vscode.Disposable[] {
  return [
    ...registerBehavioral(recorder, sessions, stats),
    ...registerGit(recorder),
    ...registerDiagnostics(recorder),
  ];
}
