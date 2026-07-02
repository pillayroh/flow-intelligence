# Flow Intelligence

A research instrument for studying **human-AI collaboration flow** during
software development in Cursor. It collects behavioral signals, AI-interaction
signals, and flow self-reports (ESM labels) as a **metadata-only**, anonymized
event stream to power the study's research questions (RQ1: model flow; RQ2: AI's
effect on performance/cognition).

> Privacy posture: no prompt text, no code, no file contents, no raw paths or
> commands are ever collected — only sizes, counts, categories, and timing.

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
