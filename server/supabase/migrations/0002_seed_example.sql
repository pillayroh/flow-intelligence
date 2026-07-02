-- Example seed. Adjust or replace per cohort. Safe to re-run.
-- Create at least one active study code before enrolling participants.

insert into study_codes (code, label, active, max_participants)
values ('PILOT-2026', 'Pilot cohort', true, 30)
on conflict (code) do nothing;
