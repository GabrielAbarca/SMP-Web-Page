-- ═══════════════════════════════════════════════════════════════
--  incremental_attendance_by_subject.sql
--
--  Adds a subject dimension to `attendance`. Costa Rica's REAC 2026
--  evaluation regulation makes attendance 5% of every subject's grade,
--  which is impossible to compute against the old shape: one row per
--  student per DAY, with `unique (student_id, class_id, date)` and an
--  even stricter `unique (student_id, date)` on top of it. The second
--  constraint means a student can have at most one attendance record
--  for an entire day across every class they're in.
--
--  That same shape is also a live bug: when two teachers share a
--  section (e.g. Math and Spanish both teaching 3.º-A), whichever one
--  saves attendance second silently overwrites the first teacher's
--  statuses and notes for that day. There is no subject for the app —
--  or the schema — to key on.
--
--  WHAT THIS DOES
--    1. Adds `attendance.class_subject_teacher_id`, nullable, FK to
--       class_subject_teachers(id) — the same FK shape already used by
--       grade_categories, assignments and student_grades.
--    2. Backfills existing rows on a best-effort basis: for each row,
--       find the class_subject_teachers row for the same class/school
--       year whose teacher is that class's homeroom_teacher_id. There
--       is no explicit "this CST is the homeroom one" flag anywhere in
--       the schema, so this is inference, not a real join — rows with
--       no match keep class_subject_teacher_id = null. Nothing is
--       deleted either way; history is preserved.
--    3. Adds unique (student_id, class_subject_teacher_id, date), then
--       drops any older unique constraint on (student_id, date) or
--       (student_id, class_id, date). Postgres treats NULLs as
--       non-conflicting in a unique constraint, so unmatched legacy
--       rows (null) never collide with each other.
--
--       The drop is matched on COLUMN SET, not on constraint name.
--       Names are not portable across projects: the demo was created
--       out of band and carries `attendance_student_class_date_unique`
--       where an inline `unique (...)` in school_schema.sql would have
--       produced `attendance_student_id_class_id_date_key`. An earlier
--       version of this file dropped two hardcoded names and therefore
--       silently left the demo's (student_id, class_id, date)
--       constraint in place — which preserves exactly the two-teacher
--       collision this migration exists to remove. Same trap, and the
--       same fix, as the dual policy names in
--       incremental_narrow_read_policies.sql.
--
--  WHAT THIS DELIBERATELY DOES NOT DO
--    The column stays nullable, but no longer because the app ignores
--    it: src/js/teacherData/attendance.js now writes
--    class_subject_teacher_id and upserts on the new constraint, and
--    refuses to write a null one. It stays nullable only to preserve
--    legacy rows the backfill above could not attribute. Making it NOT
--    NULL is a later step and needs those rows cleaned up first.
--
--    APPLY THIS FILE BEFORE DEPLOYING THAT APP VERSION. Against a
--    project still on the old shape, the new reads and writes fail with
--    42703 (no such column) / 42P10 (no matching ON CONFLICT target).
--
--    demo_lockdown.sql does NOT need to be re-run for this file. It
--    loops over pg_tables and applies its restrictive policies per
--    TABLE, not per column — attendance is already locked, and a new
--    column on an already-locked table inherits that lock for free.
--
--  ORDER OF APPLICATION
--    1. school_schema.sql (or an already-provisioned project)
--    2. this file
--    3. supabase/schema/rls_audit.sql       ← verify
--
--  Idempotent except the final ADD CONSTRAINT, which Postgres has no
--  `IF NOT EXISTS` for — it's wrapped in a guard below so re-running
--  this file is still safe. See docs/ONBOARDING_RUNBOOK.md.
-- ═══════════════════════════════════════════════════════════════

alter table public.attendance
  add column if not exists class_subject_teacher_id integer
    references public.class_subject_teachers(id) on delete set null;

create index if not exists idx_attendance_class_subject_teacher_id
  on public.attendance(class_subject_teacher_id);

-- Best-effort backfill: match each row to the class_subject_teachers row
-- for the same class/school-year taught by that class's homeroom teacher.
-- Deterministic tie-break (lowest id) for the rare case a homeroom teacher
-- teaches more than one subject in their own section. `limit 1` is inside
-- a correlated subquery rather than an UPDATE ... FROM join, specifically
-- so a homeroom teacher with multiple subjects in the section can't turn
-- this into a nondeterministic multi-row match.
update public.attendance a
set class_subject_teacher_id = (
  select cst.id
  from public.class_subject_teachers cst
  join public.classes c on c.id = a.class_id
  where cst.class_id = a.class_id
    and cst.school_year_id = c.school_year_id
    and cst.teacher_id = c.homeroom_teacher_id
  order by cst.id
  limit 1
)
where a.class_subject_teacher_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_student_id_cst_date_key'
  ) then
    alter table public.attendance
      add constraint attendance_student_id_cst_date_key
      unique (student_id, class_subject_teacher_id, date);
  end if;
end $$;

-- Drop the superseded uniques by column set rather than by name (see the
-- header). Runs AFTER the add above so the table is never left without a
-- uniqueness guarantee. Re-running finds nothing and is a no-op.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.attendance'::regclass
       and con.contype = 'u'
       and (
         select array_agg(att.attname::text order by att.attname)
           from unnest(con.conkey) as k
           join pg_attribute att
             on att.attrelid = con.conrelid and att.attnum = k
       ) in (
         array['date', 'student_id'],
         array['class_id', 'date', 'student_id']
       )
  loop
    raise notice 'dropping superseded attendance unique constraint: %', c.conname;
    execute format('alter table public.attendance drop constraint %I', c.conname);
  end loop;
end $$;
