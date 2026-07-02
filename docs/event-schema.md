# Event schema

All telemetry is stored as event rows plus ESM label rows. Payloads contain
**only** numeric/categorical metadata. The `ingest` function rejects any payload
carrying free-text content fields (see `functions/_shared/sanitize.ts`).

## Envelope (every event)

| Field        | Type        | Notes                                             |
|--------------|-------------|---------------------------------------------------|
| `ts`         | ISO string  | Client event time                                 |
| `server_ts`  | timestamptz | Set by ingest                                     |
| `source`     | enum        | `hook` (AI interaction) or `extension` (behavioral) |
| `event_type` | text        | See catalog below                                 |
| `session_id` | uuid \| null| Current coding session                            |
| `payload`    | jsonb       | Metadata only                                     |

## Ingest request body

```json
{
  "session": { "session_id": "uuid", "started_at": "ISO", "ended_at": "ISO|null", "editor_version": "str" },
  "events":  [ { "ts": "ISO", "source": "extension|hook", "event_type": "str", "session_id": "uuid|null", "payload": {} } ],
  "esm":     [ { "ts": "ISO", "session_id": "uuid|null", "flow_score": 1-5, "frustration": 1-5, "confidence": 1-5, "trigger": "scheduled|manual" } ]
}
```

Auth: `Authorization: Bearer <ingest_token>` (+ optional `apikey` header).

## Event types and payloads

### Extension (behavioral)
- `session_start` / `session_end` — `{}`
- `focus_switch` — `{ language, file_ext }`
- `window_focus` — `{ focused: bool }`
- `edit_burst` — `{ added_chars, removed_chars, change_count, span_ms, language }`
- `git_commit` — `{ changed_files }`
- `diagnostics_churn` — `{ error_count, warning_count }`

### Hook (AI interaction)
- `prompt` — `{ prompt_length, attachment_count }`
- `agent_response` / `agent_thought` — `{ text_length }`
- `agent_edit` — `{ file_ext, added_chars, removed_chars, edit_count }`
- `tab_edit` — `{ file_ext, added_chars }`
- `tool_pre` / `tool_post` — `{ tool_name, success }`
- `shell_pre` / `shell_post` — `{ command_class, exit_code }`
- `subagent_start` / `subagent_stop` — `{ subagent_type }`
- `stop` / `compact` / `session_start` / `session_end` — `{}`

### ESM labels (`esm_responses` table)
- `flow_score`, `frustration`, `confidence` — integers 1-5 (nullable if skipped)
- `trigger` — `scheduled` | `manual`

## Notes on hook payloads

Hook input field names are confirmed empirically during dogfooding (set
`"debug": true` in the forwarder config to log event key names only). The
forwarder extracts defensively across candidate field names, so unknown schemas
degrade to `null` metadata rather than errors.
