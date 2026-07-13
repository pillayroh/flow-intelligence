import * as vscode from "vscode";
import { ParticipantStore } from "./config";

const VERSION_KEY = "flowIntel.lastExtensionVersion";
const NUDGE_KEY = "flowIntel.cloudSyncNudgeAt";
const NUDGE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000; // re-prompt every 2 days

/** True when moving from a pre–personal-mode build to 0.2.0+. */
function isPersonalModeUpgrade(prev: string | undefined, cur: string): boolean {
  if (!prev) return false;
  return prev < "0.2.0" && cur >= "0.2.0";
}

/**
 * Re-engage installs that already have the extension but never enrolled (study
 * code was the old blocker). Fires on first launch, after an extension update,
 * or every few days until the user enables cloud sync or dismisses.
 */
export async function maybeNudgeCloudSync(
  ctx: vscode.ExtensionContext,
  store: ParticipantStore,
): Promise<void> {
  if (await store.isEnrolled()) return;

  const cur = ctx.extension.packageJSON.version ?? "0";
  const prev = ctx.globalState.get<string>(VERSION_KEY);
  const lastNudge = ctx.globalState.get<number>(NUDGE_KEY) ?? 0;
  const now = Date.now();

  const versionBump = prev !== undefined && prev !== cur;
  const personalUpgrade = isPersonalModeUpgrade(prev, cur);
  const firstLaunch = prev === undefined;
  const periodic = now - lastNudge >= NUDGE_INTERVAL_MS;

  await ctx.globalState.update(VERSION_KEY, cur);

  if (!firstLaunch && !versionBump && !periodic) return;
  await ctx.globalState.update(NUDGE_KEY, now);

  let message: string;
  if (personalUpgrade) {
    message =
      "Flow Intelligence updated: you can now enable cloud sync without a study code — metadata only, never your code or prompts.";
  } else if (firstLaunch) {
    message =
      "Flow Intelligence is active locally. Enable cloud sync to save your AI collaboration analytics to the cloud?";
  } else {
    message =
      "Your Flow Intelligence Mirror is still local-only. Enable cloud sync to unlock measured AI attribution and history?";
  }

  const choice = await vscode.window.showInformationMessage(
    message,
    "Enable cloud sync",
    "Not now",
  );
  if (choice === "Enable cloud sync") {
    void vscode.commands.executeCommand("flowIntel.enrollPersonal");
  }
}
