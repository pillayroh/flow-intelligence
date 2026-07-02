# Flow Intelligence — companion extension

Captures behavioral signals and renders the flow check-in (ESM) survey. On
enrollment it also installs the Cursor hooks and writes the forwarder config.

## Develop

```bash
npm install
npm run compile      # or: npm run watch
```

Press F5 to launch an Extension Development Host.

## Settings

- `flowIntel.supabaseUrl` — Supabase project URL (e.g. `https://<ref>.supabase.co`) or the local receiver URL.
- `flowIntel.supabaseAnonKey` — sent as the `apikey` header.
- `flowIntel.esm.minActiveMinutes` / `maxActiveMinutes` — check-in interval bounds (active-coding time).
- `flowIntel.esm.dailyCap` — max scheduled check-ins per day.
- `flowIntel.idleThresholdMinutes` — inactivity gap that ends a session.
- `flowIntel.flushIntervalSeconds` — telemetry flush cadence.

## Commands

- Flow Intelligence: Enroll in Study
- Flow Intelligence: Open Dashboard
- Flow Intelligence: Flow Check-in
- Flow Intelligence: Show Status (status bar entry)
- Flow Intelligence: Pause / Resume Collection
- Flow Intelligence: Withdraw from Study

## Dashboard

A beige-themed webview in the activity bar (`flowIntel.dashboard`) shows the
running indicator, live session stats, the Human-AI collaboration observation
screen (from the `summary` API), a flow-trend sparkline, the inline flow
check-in card, and a personas placeholder. Source: `src/panel/dashboard.ts`
(provider) and `src/panel/html.ts` (UI). Live behavioral stats come from
`src/stats.ts`; server aggregates from `src/summary.ts`.

## What it collects

Metadata only. See `docs/signal-catalog.md` and `docs/consent.md` in the
repository root.

## Source map

- `src/extension.ts` — activation, commands, status bar, runtime lifecycle.
- `src/enrollment.ts` — consent gate + study enrollment.
- `src/session.ts` — coding-session boundaries and active-time tracking.
- `src/transport.ts` — batched, failure-buffered ingest client.
- `src/recorder.ts` — stamps and enqueues events.
- `src/telemetry/` — behavioral, git, and diagnostics collectors.
- `src/esm/sampler.ts` — experience-sampling scheduler + survey.
- `src/hooksBootstrap.ts` — installs/removes Cursor hooks safely.
