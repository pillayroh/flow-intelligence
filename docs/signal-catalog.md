# Signal catalog (beacons)

Every signal, its capture mechanism, and how it maps to the research questions.
Tiering reflects build/priority order, not eventual importance.

## Tier 1 — built, high signal, reliable

### AI interaction (Cursor hooks)
| Signal | Event | Capture | RQ |
|--------|-------|---------|----|
| Prompt frequency / length / timing | `prompt` | `beforeSubmitPrompt` hook | RQ1, RQ2 |
| Agent edit acceptance (size) | `agent_edit` | `afterFileEdit` matcher `Write` | RQ2 |
| Tab completion acceptance (size) | `tab_edit` | `afterFileEdit` matcher `TabWrite` | RQ2 |
| Post-AI verification | `shell_pre/post` after edits | `beforeShellExecution` / `afterShellExecution` | RQ2 |
| AI output / reasoning volume | `agent_response`, `agent_thought` | `afterAgentResponse` / `afterAgentThought` | RQ2 |

### Behavioral (extension)
| Signal | Event | Capture | RQ |
|--------|-------|---------|----|
| Active vs. idle time, session length | `session_start/end` + activity | `SessionManager` | RQ1, RQ3 |
| Focus / context switches | `focus_switch`, `window_focus` | `onDidChangeActiveTextEditor`, `onDidChangeWindowState` | RQ3 |
| Edit bursts / typing cadence | `edit_burst` | `onDidChangeTextDocument` (sizes only) | RQ1 |
| Commits / change volume | `git_commit` | Git extension API | RQ1 |

### Label (extension)
| Signal | Store | Capture | RQ |
|--------|-------|---------|----|
| Flow / frustration / confidence | `esm_responses` | ESM sampler (1-5, activity-gated + manual) | RQ1, RQ2, RQ5 |

## Tier 2 — planned next

- Time-to-validate: gap between `agent_edit` and next human `edit_burst`/`shell_*` (RQ2).
- Diagnostics/error churn: `diagnostics_churn` (already emitted; deepen analysis) (RQ3).
- Task-type inference from tool mix (`tool_pre/post`, `shell` classes) (RQ1, RQ4).
- Subagent/task complexity: `subagent_start/stop`, `stop`, `compact` (RQ2, RQ4).

## Tier 3 — deferred / cut for v1

- Auditory environment (mic) — high privacy cost, weak signal.
- OS notifications, browser usage — outside the extension/hook sandbox.
- Per-tool fine-grained Tab accept/reject — only via enterprise aggregate APIs.

## Mapping to research questions

- RQ1 (model flow from signals): Tier 1 behavioral + AI signals as features, ESM as label.
- RQ2 (AI effect on performance/cognition): acceptance sizes, verification behavior, time-to-validate, rework.
- RQ3 (what disrupts flow): context switches, window focus, diagnostics churn vs. ESM dips.
- RQ4 (personas): clustering over aggregated per-participant signal profiles.
- RQ5 (predict flow breakdown): sequence models over the event stream toward ESM drops.
