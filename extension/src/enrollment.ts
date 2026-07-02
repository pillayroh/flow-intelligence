import * as vscode from "vscode";
import * as os from "node:os";
import {
  CONSENT_VERSION,
  enrollUrl,
  getSettings,
  ParticipantStore,
  writeForwarderConfig,
  ingestUrl,
} from "./config";
import { postJson } from "./http";
import { installHooks } from "./hooksBootstrap";
import { log } from "./logger";

const CONSENT_SUMMARY =
  "Flow Intelligence is a research study on human-AI collaboration flow.";
const CONSENT_DETAIL = [
  "What is collected (metadata only):",
  "  - Behavioral: active time, session length, focus/context switches, edit sizes, git commit counts, error/warning counts.",
  "  - AI interaction: prompt frequency and length, AI edit/Tab acceptance sizes, tool usage, shell command category.",
  "  - Flow check-ins: your occasional 1-5 ratings of flow, frustration, and confidence.",
  "",
  "What is NEVER collected:",
  "  - No prompt text, no code, no file contents, no raw file paths, no raw shell commands.",
  "",
  "Participation is voluntary and anonymous. You can pause or withdraw at any time",
  "via the Command Palette (Flow Intelligence: Pause / Withdraw).",
].join("\n");

export async function enroll(
  ctx: vscode.ExtensionContext,
  store: ParticipantStore,
): Promise<boolean> {
  const settings = getSettings();
  if (!settings.supabaseUrl) {
    const choice = await vscode.window.showErrorMessage(
      "Flow Intelligence is not configured. Set 'flowIntel.supabaseUrl' (and anon key) in Settings first.",
      "Open Settings",
    );
    if (choice === "Open Settings") {
      void vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "flowIntel.supabaseUrl",
      );
    }
    return false;
  }

  const consent = await vscode.window.showInformationMessage(
    CONSENT_SUMMARY,
    { modal: true, detail: CONSENT_DETAIL },
    "I Consent",
  );
  if (consent !== "I Consent") {
    log("consent declined");
    return false;
  }

  const studyCode = (
    await vscode.window.showInputBox({
      title: "Flow Intelligence: Study Code",
      prompt: "Enter the study code provided by the researcher.",
      ignoreFocusOut: true,
    })
  )?.trim();
  if (!studyCode) return false;

  const primaryAiTool = await vscode.window.showQuickPick(
    ["Cursor Agent", "Cursor Tab", "GitHub Copilot", "Other", "Prefer not to say"],
    { title: "Which AI coding tool do you use most?", ignoreFocusOut: true },
  );

  try {
    const headers: Record<string, string> = {};
    if (settings.supabaseAnonKey) {
      headers["apikey"] = settings.supabaseAnonKey;
      headers["Authorization"] = `Bearer ${settings.supabaseAnonKey}`;
    }
    const res = await postJson(
      enrollUrl(settings),
      {
        study_code: studyCode,
        consent_version: CONSENT_VERSION,
        editor_version: vscode.version,
        platform: os.platform(),
        primary_ai_tool: primaryAiTool ?? null,
      },
      headers,
    );

    if (res.status < 200 || res.status >= 300) {
      vscode.window.showErrorMessage(`Enrollment failed (${res.status}). ${res.body.slice(0, 120)}`);
      return false;
    }

    const data = JSON.parse(res.body) as { participant_id: string; ingest_token: string };
    await store.setParticipantId(data.participant_id);
    await store.setToken(data.ingest_token);
    await store.setEnabled(true);

    writeForwarderConfig({
      ingest_url: ingestUrl(settings),
      token: data.ingest_token,
      apikey: settings.supabaseAnonKey || undefined,
      participant_id: data.participant_id,
      session_id: null,
      enabled: true,
      debug: false,
    });

    installHooks(ctx);

    vscode.window.showInformationMessage(
      "Flow Intelligence: enrolled. Thank you for participating! Restart Cursor once so the hooks load.",
    );
    return true;
  } catch (err) {
    vscode.window.showErrorMessage(`Enrollment error: ${String(err)}`);
    return false;
  }
}
