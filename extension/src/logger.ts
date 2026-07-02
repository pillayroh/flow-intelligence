import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function initLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Flow Intelligence");
  }
  return channel;
}

export function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  (channel ?? initLogger()).appendLine(line);
}
