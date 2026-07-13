-- Personal mode: public self-serve enrollment without a researcher-issued code.
-- Study cohorts continue to use private study_codes rows (IRB-gated).

alter table participants
  add column if not exists enrollment_mode text not null default 'study'
  check (enrollment_mode in ('personal', 'study'));

-- Permanent, always-on code for personal users. Not secret — the extension
-- enrolls with mode=personal and the server maps to this row. IRB study codes
-- remain separate, inactive until you deliberately open a cohort.
insert into study_codes (code, label, active, max_participants)
values ('PERSONAL', 'Personal analytics (public)', true, null)
on conflict (code) do update
  set active = true, label = excluded.label, max_participants = null;
