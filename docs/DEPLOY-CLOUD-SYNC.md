# Deploy cloud sync (required for personal enrollment)

Personal enrollment **will fail** until the backend has the `PERSONAL` study code
and the updated `enroll` function. As of the pilot pull, the database still had
only `PILOT-2026` participants and **no `enrollment_mode` column** — meaning
migration `0002` had not been applied yet.

## Checklist (do all three)

### 1. Apply the database migration

**Option A — Supabase CLI** (from `server/`):

```bash
supabase db push
```

**Option B — Supabase SQL Editor** (paste and run):

```sql
alter table participants
  add column if not exists enrollment_mode text not null default 'study'
  check (enrollment_mode in ('personal', 'study'));

insert into study_codes (code, label, active, max_participants)
values ('PERSONAL', 'Personal analytics (public)', true, null)
on conflict (code) do update
  set active = true, label = excluded.label, max_participants = null;
```

Verify:

```sql
select code, active from study_codes where code = 'PERSONAL';
```

You should see one row: `PERSONAL | true`.

### 2. Redeploy the enroll Edge Function

The function must accept `mode: "personal"` in the request body.

```bash
cd server
supabase functions deploy enroll
```

### 3. Publish extension ≥ 0.2.1

Existing installs on **0.1.x** still require a study code. They only get
personal enrollment after updating from Open VSX / VS Code Marketplace.

```bash
cd extension
npm run compile
npx @vscode/vsce package
npx ovsx publish flow-intelligence-0.2.1.vsix -p <OPEN_VSX_TOKEN>
npx @vscode/vsce publish -p <AZURE_PAT>
```

## What existing users will see (0.2.1+)

- Status bar: **`Flow: sync`** — click = enable cloud sync (no code)
- Notification on update / every 2 days until enrolled or dismissed
- Dashboard card: **Enable cloud sync**

They must **update the extension** and **restart Cursor once** after enrolling
(so AI hooks load).

## Verify enrollment is working

After you enroll yourself on a test machine:

```bash
cd analysis && node pull.mjs
```

Look for a new `participants` row with `study_code: PERSONAL` and
`enrollment_mode: personal`.

## Why 920 installs ≠ 920 participants

| Stage | What happened |
|-------|----------------|
| Install | Marketplace download — extension loads, local Mirror runs |
| Enroll (old) | Required private `PILOT-2026` code — most users stopped here |
| Backend | Personal mode not deployed — even 0.2.0 enroll would 403 |
| Update | Users on 0.1.x don't have personal flow until they update |

Only **enrolled** users appear in `participants`. Everyone else is local-only
until they enable cloud sync.
