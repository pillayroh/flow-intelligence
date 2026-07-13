import * as vscode from "vscode";
import * as os from "node:os";
import {
  CONSENT_VERSION_PERSONAL,
  CONSENT_VERSION_STUDY,
  enrollUrl,
  getSettings,
  ParticipantStore,
  writeForwarderConfig,
  ingestUrl,
} from "./config";
import { postJson } from "./http";
import { installHooks } from "./hooksBootstrap";
import { log } from "./logger";

const PERSONAL_SUMMARY =
  "Enable personal AI usage analytics with Flow Intelligence.";
const PERSONAL_DETAIL = [
  "What syncs to the cloud (metadata only):",
  "  - Your AI vs human coding mix (measured + estimated)",
  "  - Session length, focus switches, edit sizes, git activity",
  "  - AI prompts (count/length only), agent edits, tool usage",
  "  - Optional flow check-ins (1-5 self-ratings)",
  "",
  "What is NEVER collected:",
  "  - No prompt text, no code, no file contents, no raw paths or commands.",
  "",
  "Your local Mirror keeps working on-device. You can pause cloud sync or",
  "delete your cloud data anytime via Command Palette.",
].join("\n");

const STUDY_SUMMARY =
  "Flow Intelligence research study on human-AI collaboration flow.";
const STUDY_DETAIL = [
  "What is collected (metadata only):",
  "  - Behavioral: active time, session length, focus/context switches, edit sizes, git commit counts, error/warning counts.",
  "  - AI interaction: prompt frequency and length, AI edit/Tab acceptance sizes, tool usage, shell command category.",
  "  - Flow check-ins: your occasional 1-5 ratings of flow, frustration, and confidence.",
  "",
  "What is NEVER collected:",
  "  - No prompt text, no code, no file contents, no raw file paths, no raw shell commands.",
  "",
  "Participation is voluntary and anonymous. You can pause or withdraw at any time.",
].join("\n");

export type EnrollmentMode = "personal" | "study";

/** Entry point: pick personal (default) or study cohort. */
export async function enroll(
  ctx: vscode.ExtensionContext,
  store: ParticipantStore,
  mode?: EnrollmentMode,
): Promise<boolean> {
  if (!mode) {
    const pick = await vscode.window.showQuickPick(
      [
        {
          label: "$(cloud-upload) Personal analytics",
          description: "Sync your AI usage stats to the cloud — no study code needed",
          mode: "personal" as const,
        },
        {
          label: "$(mortar-board) Research study",
          description: "I have a study code from the researcher",
          mode: "study" as const,
        },
      ],
      { title: "Flow Intelligence: Get started", ignoreFocusOut: true },
    );
    if (!pick) return false;
    mode = pick.mode;
  }
  return mode === "personal"
    ? enrollPersonal(ctx, store)
    : enrollStudy(ctx, store);
}

export async function enrollPersonal(
  ctx: vscode.ExtensionContext,
  store: ParticipantStore,
): Promise<boolean> {
  const consent = await vscode.window.showInformationMessage(
    PERSONAL_SUMMARY,
    { modal: true, detail: PERSONAL_DETAIL },
    "Enable cloud sync",
  );
  if (consent !== "Enable cloud sync") {
    log("personal consent declined");
    return false;
  }
  return completeEnrollment(ctx, store, "personal", CONSENT_VERSION_PERSONAL);
}

export async function enrollStudy(
  ctx: vscode.ExtensionContext,
  store: ParticipantStore,
): Promise<boolean> {
  const consent = await vscode.window.showInformationMessage(
    STUDY_SUMMARY,
    { modal: true, detail: STUDY_DETAIL },
    "I Consent",
  );
  if (consent !== "I Consent") {
    log("study consent declined");
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

  return completeEnrollment(ctx, store, "study", CONSENT_VERSION_STUDY, studyCode);
}

async function completeEnrollment(
  ctx: vscode.ExtensionContext,
  store: ParticipantStore,
  mode: EnrollmentMode,
  consentVersion: string,
  studyCode?: string,
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

  const primaryAiTool = await vscode.window.showQuickPick(
    ["Cursor Agent", "Cursor Tab", "GitHub Copilot", "Claude Code", "Other", "Prefer not to say"],
    { title: "Which AI coding tool do you use most?", ignoreFocusOut: true },
  );

  try {
    const headers: Record<string, string> = {};
    if (settings.supabaseAnonKey) {
      headers["apikey"] = settings.supabaseAnonKey;
      headers["Authorization"] = `Bearer ${settings.supabaseAnonKey}`;
    }

    const body: Record<string, unknown> = {
      mode,
      consent_version: consentVersion,
      editor_version: vscode.version,
      platform: os.platform(),
      primary_ai_tool: primaryAiTool ?? null,
    };
    if (mode === "study" && studyCode) body.study_code = studyCode;

    const res = await postJson(enrollUrl(settings), body, headers);

    if (res.status < 200 || res.status >= 300) {
      let detail = res.body.slice(0, 200);
      try {
        const err = JSON.parse(res.body) as { error?: string };
        if (err.error === "invalid_study_code" && mode === "personal") {
          detail =
            "Server is missing the PERSONAL enrollment code. Apply migration 0002_personal_mode.sql and redeploy the enroll function (see docs/DEPLOY-CLOUD-SYNC.md).";
        } else if (err.error === "invalid_study_code") {
          detail = "That study code is invalid or inactive.";
        } else if (err.error === "study_full") {
          detail = "This study cohort is full.";
        }
      } catch { /* use raw body */ }
      vscode.window.showErrorMessage(`Enrollment failed (${res.status}). ${detail}`);
      return false;
    }

    const data = JSON.parse(res.body) as {
      participant_id: string;
      ingest_token: string;
      enrollment_mode?: EnrollmentMode;
    };
    await store.setParticipantId(data.participant_id);
    await store.setToken(data.ingest_token);
    await store.setEnrollmentMode(data.enrollment_mode ?? mode);
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

    const msg =
      mode === "personal"
        ? "Flow Intelligence: cloud sync enabled. Restart Cursor once so AI hooks load."
        : "Flow Intelligence: enrolled in the study. Restart Cursor once so the hooks load.";
    vscode.window.showInformationMessage(msg);
    return true;
  } catch (err) {
    vscode.window.showErrorMessage(`Enrollment error: ${String(err)}`);
    return false;
  }
}
