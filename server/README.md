# Flow Intelligence — Supabase backend

Ingest + storage layer for the study. Postgres tables behind two Edge Functions
(`enroll`, `ingest`). All writes go through the service role inside the
functions; RLS denies direct client access.

## Layout

- `supabase/migrations/` — SQL schema (`0001_init.sql`, `0002_personal_mode.sql`).
- `supabase/functions/enroll/` — issues a per-participant ingest token against a study code.
- `supabase/functions/ingest/` — authenticates the token and stores events + ESM responses.
- `supabase/functions/_shared/` — CORS, token hashing, payload sanitation.
- `supabase/config.toml` — disables JWT verification (we auth at the app layer).

## Setup

1. Install the Supabase CLI and log in: `supabase login`.
2. Link (or create) a project: `supabase link --project-ref <ref>`.
3. Apply migrations (includes the always-on `PERSONAL` code for public cloud sync):

```bash
supabase db push
```

   For IRB study cohorts, seed a **private** study code separately (keep it out of
   version control):

```sql
insert into study_codes (code, label, active, max_participants)
values ('<YOUR-STUDY-CODE>', 'IRB cohort', true, 30);
```

   Personal users enroll with `mode: personal` (no code). Study participants use
   `mode: study` + your private code.

4. Deploy the functions:

```bash
supabase functions deploy enroll
supabase functions deploy ingest
supabase functions deploy summary
```

The functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
managed environment automatically.

## Functions

- `enroll` — issues a per-participant ingest token. `mode: personal` (public, no
  code) or `mode: study` (private study code + cap).
- `ingest` — authenticates the token and stores events + ESM responses.
- `summary` — participant self-serve read path for the dashboard: returns
  aggregated, metadata-only stats (AI vs human collaboration, event counts,
  active time, ESM history) scoped to the caller's token. Keeps RLS intact.

## Client-facing endpoints

- `POST https://<ref>.supabase.co/functions/v1/enroll`
- `POST https://<ref>.supabase.co/functions/v1/ingest`
- `POST https://<ref>.supabase.co/functions/v1/summary`

Give the project URL + anon key to the extension (its settings) so it can call
`enroll`; the extension then stores the issued ingest token and writes the
forwarder config.

## Reading the data

Query from the Supabase SQL editor (service role). Useful starting points:

```sql
-- events per participant per day
select participant_id, date_trunc('day', ts) d, count(*)
from events group by 1, 2 order by 2 desc;

-- ESM label distribution
select flow_score, count(*) from esm_responses group by 1 order by 1;
```
