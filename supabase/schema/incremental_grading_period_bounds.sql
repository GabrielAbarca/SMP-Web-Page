-- ═══════════════════════════════════════════════════════════════
--  incremental_grading_period_bounds.sql
--
--  Keeps every grading period inside its parent school year, and its
--  start on or before its end. The admin console validates the same two
--  rules inline before it writes (src/js/gradingPeriods.js →
--  checkPeriodRange); this trigger is the backstop for anything that
--  bypasses that form — CSV import, the SQL editor, a future API client.
--
--  A CHECK constraint cannot express this: the bounds live in another
--  table (school_years), so it has to be a trigger.
--
--  Already inlined in school_schema.sql for fresh per-school projects.
--  Apply this snippet by hand to a project that predates it — see
--  docs/ONBOARDING_RUNBOOK.md. Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- SECURITY DEFINER so the bounds check always reads the parent year, even
-- under a restrictive RLS policy that would otherwise hide the row and make
-- a legitimate period look unverifiable. Fixed search_path per the same
-- hardening as is_admin() / handle_new_user().
create or replace function public.grading_period_within_year()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  y_start date;
  y_end   date;
begin
  if new.start_date > new.end_date then
    raise exception
      'Grading period start date (%) must be on or before its end date (%)',
      new.start_date, new.end_date
      using errcode = 'check_violation';
  end if;

  select start_date, end_date into y_start, y_end
  from public.school_years
  where id = new.school_year_id;

  if y_start is null then
    raise exception 'School year % not found', new.school_year_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.start_date < y_start or new.end_date > y_end then
    raise exception
      'Grading period % to % falls outside its school year % (% to %)',
      new.start_date, new.end_date, new.school_year_id, y_start, y_end
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Only the trigger invokes it; nothing should call it directly.
revoke execute on function public.grading_period_within_year()
  from anon, authenticated, public;

drop trigger if exists grading_periods_within_year on public.grading_periods;
create trigger grading_periods_within_year
  before insert or update on public.grading_periods
  for each row execute function public.grading_period_within_year();
