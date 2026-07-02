# Flow Intelligence — Cursor hooks

Captures AI-interaction signals from Cursor's agent and Tab, forwarding
**metadata only** to the ingest endpoint.

## Files

- `forwarder.mjs` — reads a hook event on stdin, reduces it to metadata, and POSTs to ingest. No external dependencies. Always fails open (never blocks your work).
- `hooks.template.json` — wires each hook event to the forwarder with a distinct event-type argument.

## Installation

In normal use the companion extension installs these for you on enrollment
(it merges the hook entries into `~/.cursor/hooks.json` and copies
`forwarder.mjs` to `~/.cursor/hooks/`, then writes the config the forwarder
reads). This directory is the canonical source + a manual fallback.

Manual install (user-level, applies across all your Cursor projects):

1. Copy `forwarder.mjs` to `~/.cursor/hooks/forwarder.mjs`.
2. Merge the entries from `hooks.template.json` into `~/.cursor/hooks.json`
   (preserve any existing hooks you have). Commands invoke `bun`.
3. Ensure `~/.cursor/flow-intel/config.json` exists (written by the extension
   at enrollment):

```json
{
  "ingest_url": "https://<ref>.supabase.co/functions/v1/ingest",
  "token": "<per-participant ingest token>",
  "apikey": "<supabase anon key, optional>",
  "participant_id": "<uuid>",
  "session_id": null,
  "enabled": true,
  "debug": false
}
```

## Requirements

- `bun` must be installed (verify with `command -v bun`). The companion extension
  resolves Bun's absolute path at install time and writes it into the hook
  commands, so hooks work even if the hook shell's PATH lacks `~/.bun/bin`. For a
  manual install, ensure `bun` is on PATH or edit the command paths in
  `~/.cursor/hooks.json` to Bun's absolute path.

## What is captured

Only lengths, counts, categories, and timing — for example prompt *length*
(not text), edit *size* and *file extension* (not code or path), shell command
*class* like `test`/`git`/`run` (not the command). Set `"debug": true` in the
config to log only the event key *names* (never values) to
`~/.cursor/flow-intel/forwarder.log` while confirming the hook input schema.
