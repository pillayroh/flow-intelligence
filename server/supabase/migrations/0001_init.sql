-- Flow Intelligence: initial schema
-- Event-sourced telemetry for a small human-AI collaboration flow study.
-- Privacy posture: metadata only. No prompt text, no code, no raw file contents.
-- Writes happen exclusively through Edge Functions using the service role
-- (which bypasses RLS). RLS is enabled with no anon/authenticated policies,
-- so direct client access is denied by default. The researcher reads via the
-- service role / SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Study codes: gate enrollment. A participant must present a valid, active
-- code to enroll. Seed rows manually per study/cohort.
-- ---------------------------------------------------------------------------
create table if not exists study_codes (
  code                text primary key,
  label               text,
  active              boolean not null default true,
  max_participants    integer,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Participants: one row per enrolled, consented participant. Anonymous.
-- token_hash is the SHA-256 (hex) of the opaque ingest token handed to the
-- client at enrollment; the raw token is never stored.
-- ---------------------------------------------------------------------------
create table if not exists participants (
  participant_id      uuid primary key default gen_random_uuid(),
  study_code          text not null references study_codes(code),
  token_hash          text not null unique,
  consent_version     text not null,
  consented_at        timestamptz not null default now(),
  editor_version      text,
  platform            text,
  primary_ai_tool     text,
  persona             text,
  withdrawn_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists participants_study_code_idx on participants (study_code);

-- ---------------------------------------------------------------------------
-- Sessions: coarse coding-session boundaries reported by the extension.
-- session_id is client-generated (uuid) so both the extension and the hook
-- forwarder can reference the same active session.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  session_id          uuid primary key,
  participant_id      uuid not null references participants(participant_id) on delete cascade,
  started_at          timestamptz not null,
  ended_at            timestamptz,
  editor_version      text,
  created_at          timestamptz not null default now()
);

create index if not exists sessions_participant_idx on sessions (participant_id);

-- ---------------------------------------------------------------------------
-- Events: single wide event-sourced table. payload holds only numeric /
-- categorical metadata (sizes, counts, durations, classifications).
-- source distinguishes hook (AI-interaction) vs extension (behavioral).
-- ---------------------------------------------------------------------------
create table if not exists events (
  event_id            uuid primary key default gen_random_uuid(),
  participant_id      uuid not null references participants(participant_id) on delete cascade,
  session_id          uuid references sessions(session_id) on delete set null,
  ts                  timestamptz not null,
  server_ts           timestamptz not null default now(),
  source              text not null check (source in ('hook', 'extension')),
  event_type          text not null,
  payload             jsonb not null default '{}'::jsonb
);

create index if not exists events_participant_ts_idx on events (participant_id, ts);
create index if not exists events_type_idx on events (event_type);
create index if not exists events_session_idx on events (session_id);

-- ---------------------------------------------------------------------------
-- ESM responses: the flow self-report labels. The target variable for RQ1/RQ2.
-- Scores are 1-5 Likert-style integers.
-- ---------------------------------------------------------------------------
create table if not exists esm_responses (
  response_id         uuid primary key default gen_random_uuid(),
  participant_id      uuid not null references participants(participant_id) on delete cascade,
  session_id          uuid references sessions(session_id) on delete set null,
  ts                  timestamptz not null,
  server_ts           timestamptz not null default now(),
  flow_score          integer check (flow_score between 1 and 5),
  frustration         integer check (frustration between 1 and 5),
  confidence          integer check (confidence between 1 and 5),
  trigger             text not null check (trigger in ('scheduled', 'manual'))
);

create index if not exists esm_participant_ts_idx on esm_responses (participant_id, ts);

-- ---------------------------------------------------------------------------
-- Row Level Security: enable everywhere, define no anon/authenticated policies.
-- The service role used by Edge Functions bypasses RLS. This denies all direct
-- client (anon key) access to the raw tables.
-- ---------------------------------------------------------------------------
alter table study_codes    enable row level security;
alter table participants   enable row level security;
alter table sessions       enable row level security;
alter table events         enable row level security;
alter table esm_responses  enable row level security;
