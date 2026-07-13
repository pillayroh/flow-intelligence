# Flow Intelligence — product architecture

## Positioning

**Personal AI usage analytics for developers** — with an optional research cohort
layer later. Not "research-only."

The extension has three tiers of capability:

| Tier | Who | What works | Data destination |
|------|-----|------------|------------------|
| **Local Mirror** | Everyone (no signup) | On-device AI/human mix estimate, session stats, archetype mirror | `globalState` only — never leaves the machine |
| **Personal (cloud)** | Anyone who opts in | + measured AI hooks, flow check-ins, cloud dashboard, history | Supabase (`enrollment_mode = personal`) |
| **Study cohort** | IRB-consented participants with a private code | Same pipeline, tagged for formal analysis | Supabase (`enrollment_mode = study`) |

## Data flow (Personal + Study)

```
Editor
  ├── hooks/forwarder.mjs ──► ingest (hook events: agent_edit, prompt, shell, …)
  └── extension ───────────► ingest (extension events: edit_burst, focus, ESM, …)
                                    │
                                    ▼
                            Supabase Postgres
                              ├── participants (mode: personal | study)
                              ├── sessions
                              ├── events
                              └── esm_responses
```

**Yes — all event hooks and extension telemetry land in Supabase** once the user
enables cloud sync (Personal or Study). The privacy rule is unchanged:
metadata only, no code, no prompts, no paths.

Local Mirror data is **not** uploaded unless the user opts into cloud sync.

## Roadmap: team / org aggregate (Phase 3)

Personal mode is individual-first. The natural B2B extension:

```
teams
  team_id, name, created_at

team_memberships
  team_id, participant_id, role (member | admin), joined_at

team_invites
  code, team_id, expires_at
```

**Manager/exec view** (future `team_summary` Edge Function):

- Aggregate AI adoption % across the team (no individual code)
- Median flow scores, check-in completion rates
- Verification-after-AI-edit rates
- Session length / focus-switch distributions
- Opt-in only; individuals can leave a team without deleting personal history

Design constraints for team mode:

- **No code-level surveillance** — same metadata-only rule as personal
- **Minimum team size** for aggregates (e.g. n ≥ 5) so one person isn't identifiable
- **Admin sees aggregates, not raw events** unless the org contract explicitly allows it (enterprise tier)

## APM / recruiting narrative

Lead with: *"Built a privacy-first developer analytics product for the AI-coding
era — 900+ marketplace installs, personal + cloud tiers, metadata-only by design."*

Supporting metrics to track:

- Installs → Mirror opened → Cloud sync enabled (activation)
- D7 / D30 retention
- Scheduled ESM completion rate
- AI mix distribution across users

## Research (parallel, not blocking)

IRB study cohorts use `enrollment_mode = study` + a private `study_codes` row.
Personal users are excluded from published study datasets by filtering
`enrollment_mode = 'study'`.
