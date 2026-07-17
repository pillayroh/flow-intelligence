# Flow Intelligence

A research instrument for studying **developer flow** and **human-AI collaboration**
during real software work in Cursor and VS Code. The extension runs in the editor,
passively observes how someone codes and interacts with AI tools, and occasionally
asks brief flow check-ins. Everything collected is **metadata only** (counts, sizes,
timings, categories) and **anonymized**.

> Privacy posture: no prompt text, no code, no file contents, no raw paths or
> commands are ever collected.

## Research questions

**RQ1 — Can we model flow from passive signals?**

Developers often know when they are "in flow," but that state is hard to measure
from the outside. Traditional proxies (commits, lines of code, time at desk) miss
the cognitive side. RQ1 asks whether flow can be *predicted or explained* from
passively observed behavior during a coding session: edit rhythm, focus switches,
session length, AI usage patterns, and similar signals. The ground truth is the
developer's own rating, collected through short in-editor check-ins (see Methods).

**RQ2 — How does human-AI collaboration relate to flow?**

AI assistants change *how* code gets written, not just how much. RQ2 asks how
collaboration *style* relates to self-reported flow, confidence, and frustration.
For example: does someone who delegates large edits to the agent and verifies
with tests report different flow than someone who accepts many small Tab
completions? We look at the mix of human vs. AI contribution, prompt frequency,
edit acceptance sizes, and verification behavior (e.g. running tests after an
AI edit), then relate those patterns to ESM check-in scores.

## Methods

### What we observe (passive telemetry)

Two complementary signal streams, merged into one anonymized event log:

| Stream | Examples | Used for |
|--------|----------|----------|
| **Editor behavior** | Active/idle time, focus switches, edit burst sizes, git activity, diagnostics churn | RQ1, context for RQ2 |
| **AI interaction** | Prompt frequency/length, agent edit sizes, Tab accepts, tool use, shell command *category* | RQ2, features for RQ1 |

On platforms where AI tools expose direct instrumentation (Cursor agent/Tab,
Claude Code), AI attribution is **measured**. Elsewhere it is **estimated** from
behavioral heuristics; both are stored and labeled so analysis can treat them
differently.

### Ground truth (experience sampling)

Short, activity-gated **flow check-ins** ask the developer to rate current
**flow**, and optionally **frustration** and **confidence**, on 1–5 scales.
These self-reports are the *labels* for RQ1 and the *outcomes* for RQ2.
Check-ins appear after sustained coding activity and can also be triggered manually.

### Privacy and consent

- **Metadata only, never content.** Only numeric and categorical fields are
  transmitted; the server rejects payloads containing free text or forbidden keys.
- **Anonymous.** Participants are identified by a random UUID, not name or email.
- **Consent-gated.** Cloud collection begins only after an explicit in-editor
  consent screen and enrollment (Personal opt-in or Study code).
- **Withdrawable.** Participants can pause or withdraw at any time; withdrawal
  stops all collection.

See [`docs/consent.md`](docs/consent.md) for the full consent language.

### Analysis approach (planned)

1. **RQ1:** Aggregate passive signals over rolling windows (session, hour, day);
   train regressors/classifiers to predict ESM flow scores; evaluate which signal
   families carry the most predictive power.
2. **RQ2:** Derive collaboration features (human/AI char share, delegation vs.
   verification ratio, time-to-validate after AI edits); correlate and model
   against flow, frustration, and confidence ratings.
3. **Personas (future):** Cluster participants by aggregated signal profiles once
   cohort size supports it.

Full signal list: [`docs/signal-catalog.md`](docs/signal-catalog.md).
Event schema: [`docs/event-schema.md`](docs/event-schema.md).

## Architecture

```
Cursor (participant machine)
  ├── hooks/ ............... AI-interaction events -> forwarder.mjs -> ingest
  └── extension/ .......... behavioral signals + ESM check-ins -> ingest
                              (also installs hooks + writes forwarder config)
        │
        ▼
  server/ (Supabase) ...... enroll + ingest Edge Functions -> Postgres (+RLS)
```

Two capture layers feed one ingest endpoint:

- **Hooks** (`hooks/`) observe Cursor's agent + Tab lifecycle. See `hooks/README.md`.
- **Companion extension** (`extension/`) captures editor behavior, renders the
  flow check-in UI, and hosts the dashboard. See `extension/README.md`.
- **Backend** (`server/`) is Supabase: `enroll` / `ingest` / `summary` Edge
  Functions and a Postgres schema with RLS. See `server/README.md`.

## Dashboard

The extension contributes a **Flow Intelligence** view in the activity bar (wave
icon). It is a beige-themed, minimalist dashboard that shows:

- a **running indicator** so you always know the extension is active (Running /
  Idle / Paused / Not enrolled);
- **this session** live stats (edit bursts, focus switches, chars, commits);
- a **Human · AI collaboration** observation screen (AI vs. your character
  share, prompts, agent edits, Tab accepts, verifications) from the `summary` API;
- a **flow trend** sparkline over your ESM check-ins;
- an inline **flow check-in card** that appears at intervals (and on demand);
- a **personas** placeholder for the future "what kind of developer are you?" view.

> Platform note: VS Code/Cursor extensions cannot render truly free-floating
> overlays on the editor surface. The idiomatic equivalent used here is the
> always-present activity-bar view + a pulsing status-bar indicator; check-ins
> reveal the view and show a card, with a status-bar nudge.

Docs: [`docs/signal-catalog.md`](docs/signal-catalog.md),
[`docs/event-schema.md`](docs/event-schema.md),
[`docs/consent.md`](docs/consent.md).

## Quick start (researcher)

1. **Backend** — deploy Supabase (schema + functions) and seed a study code.
   See `server/README.md`.
2. **Extension** — build it:

   ```bash
   cd extension && npm install && npm run compile
   ```

   Press F5 in Cursor/VS Code to launch an Extension Development Host, or package
   with `vsce package`.
3. **Configure** the extension settings `flowIntel.supabaseUrl` and
   `flowIntel.supabaseAnonKey`.
4. **Enroll** via Command Palette -> "Flow Intelligence: Enroll in Study",
   entering the study code. This issues a token, writes the forwarder config, and
   installs the Cursor hooks. Restart Cursor once so hooks load.

## Dogfooding without a backend

Run the local receiver and point the clients at it:

```bash
bun tools/local-ingest.mjs            # http://127.0.0.1:8787
```

Set `flowIntel.supabaseUrl` to `http://127.0.0.1:8787`, enroll, and watch the
receiver print an event-type summary as you work. Set `"debug": true` in
`~/.cursor/flow-intel/config.json` to log hook event key names while confirming
the hook input schema.

## Repository layout

- `extension/` — TypeScript companion extension (Cursor/VS Code).
- `hooks/` — `forwarder.mjs` + `hooks.template.json` (installed into `~/.cursor/`).
- `server/` — Supabase migrations + Edge Functions.
- `tools/` — `local-ingest.mjs` dev receiver.
- `docs/` — signal catalog, event schema, consent.
