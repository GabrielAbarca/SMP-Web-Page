-- ═══════════════════════════════════════════════════════════════
--  incremental_teacher_policies.sql
--
--  Teacher-scoped row-level security + the gradebook view the teacher
--  console reads.
--
--  WHY THIS EXISTS
--  school_schema.sql ships three kinds of policy: admins can do anything,
--  any authenticated user can read the reference/structure tables, and a
--  student can read their own rows. There is nothing for the `teacher`
--  role — so on a project built from that file alone a teacher cannot read
--  a single student, assignment, or grade, and the teacher console
--  (src/js/teacher.js) is non-functional outside demo mode. This snippet
--  closes that gap.
--
--  THE RULE IT ENCODES
--  A teacher may read and write the academic records of the classes they
--  actually teach — the classes reachable through class_subject_teachers,
--  plus any class where they are the homeroom teacher — and nothing else.
--  Deliberately NOT granted: any write to students, classes, schedules,
--  teachers, or the reference tables. Those are admin surfaces, and
--  supabase/schema/rls_audit.sql asserts a teacher is still refused there.
--
--  Policies are permissive, so they are OR-ed with the admin policies
--  already in place; an admin keeps full access and loses nothing.
--
--  ORDER OF APPLICATION
--    1. school_schema.sql (or an already-provisioned project)
--    2. this file
--    3. supabase/schema/demo_lockdown.sql   ← demo project only
--    4. supabase/schema/rls_audit.sql       ← verify
--
--  Idempotent: safe to re-run. See docs/ONBOARDING_RUNBOOK.md.
-- ═══════════════════════════════════════════════════════════════

-- ── Helpers ────────────────────────────────────────────────────
-- SECURITY DEFINER because a policy on `teachers` would otherwise have to
-- read `teachers` to decide whether you may read `teachers`. Fixed
-- search_path per the same hardening as is_admin() / handle_new_user().
-- EXECUTE stays granted to `authenticated` (policies evaluate as the
-- calling role); `anon` and `public` have no business calling these.

create or replace function public.teacher_id()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.teachers where auth_user_id = auth.uid();
$$;

revoke execute on function public.teacher_id() from anon, public;

-- Every class the caller teaches: subject assignments plus homeroom.
create or replace function public.teacher_class_ids()
returns setof integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select cst.class_id
    from public.class_subject_teachers cst
   where cst.teacher_id = public.teacher_id()
  union
  select c.id
    from public.classes c
   where c.homeroom_teacher_id = public.teacher_id();
$$;

revoke execute on function public.teacher_class_ids() from anon, public;

-- Every class_subject_teachers row the caller owns. The gradebook tables
-- hang off this id, so most policies below are one lookup against it.
create or replace function public.teacher_cst_ids()
returns setof integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.class_subject_teachers where teacher_id = public.teacher_id();
$$;

revoke execute on function public.teacher_cst_ids() from anon, public;

-- ── Students ───────────────────────────────────────────────────
-- Read-only: rosters are an admin surface. A teacher sees a student only
-- while that student sits in one of their classes.
drop policy if exists "Teachers read students in their classes" on public.students;
create policy "Teachers read students in their classes" on public.students
  for select to authenticated
  using (class_id in (select public.teacher_class_ids()));

-- ── Attendance ─────────────────────────────────────────────────
-- Full write access, scoped by class. `with check` mirrors `using` so a
-- teacher cannot move a record into a class they don't teach.
drop policy if exists "Teachers manage attendance for their classes" on public.attendance;
create policy "Teachers manage attendance for their classes" on public.attendance
  for all to authenticated
  using (class_id in (select public.teacher_class_ids()))
  with check (class_id in (select public.teacher_class_ids()));

-- ── Gradebook ──────────────────────────────────────────────────
drop policy if exists "Teachers manage their grade categories" on public.grade_categories;
create policy "Teachers manage their grade categories" on public.grade_categories
  for all to authenticated
  using (class_subject_teacher_id in (select public.teacher_cst_ids()))
  with check (class_subject_teacher_id in (select public.teacher_cst_ids()));

drop policy if exists "Teachers manage their assignments" on public.assignments;
create policy "Teachers manage their assignments" on public.assignments
  for all to authenticated
  using (class_subject_teacher_id in (select public.teacher_cst_ids()))
  with check (class_subject_teacher_id in (select public.teacher_cst_ids()));

-- Grades reach their owner through the assignment.
drop policy if exists "Teachers manage grades on their assignments" on public.assignment_grades;
create policy "Teachers manage grades on their assignments" on public.assignment_grades
  for all to authenticated
  using (assignment_id in (
    select a.id from public.assignments a
     where a.class_subject_teacher_id in (select public.teacher_cst_ids())))
  with check (assignment_id in (
    select a.id from public.assignments a
     where a.class_subject_teacher_id in (select public.teacher_cst_ids())));

drop policy if exists "Teachers manage period grades for their subjects" on public.student_grades;
create policy "Teachers manage period grades for their subjects" on public.student_grades
  for all to authenticated
  using (class_subject_teacher_id in (select public.teacher_cst_ids()))
  with check (class_subject_teacher_id in (select public.teacher_cst_ids()));

-- ── Discipline ─────────────────────────────────────────────────
-- Read anything about their own students; write only in their own name, so
-- one teacher cannot file or rewrite a report attributed to another.
drop policy if exists "Teachers read discipline for their students" on public.discipline_records;
create policy "Teachers read discipline for their students" on public.discipline_records
  for select to authenticated
  using (student_id in (
    select s.id from public.students s
     where s.class_id in (select public.teacher_class_ids())));

drop policy if exists "Teachers file their own discipline reports" on public.discipline_records;
create policy "Teachers file their own discipline reports" on public.discipline_records
  for insert to authenticated
  with check (
    reported_by_teacher = public.teacher_id()
    and student_id in (
      select s.id from public.students s
       where s.class_id in (select public.teacher_class_ids())));

drop policy if exists "Teachers update their own discipline reports" on public.discipline_records;
create policy "Teachers update their own discipline reports" on public.discipline_records
  for update to authenticated
  using (reported_by_teacher = public.teacher_id())
  with check (reported_by_teacher = public.teacher_id());

-- ═══════════════════════════════════════════════════════════════
--  student_period_grades — the gradebook's computed overall score
-- ═══════════════════════════════════════════════════════════════
--
--  ⚠ VERIFY BEFORE APPLYING ⚠
--  This view already exists on the demo project, where it was authored by
--  hand and never tracked in git. The definition below is reconstructed
--  from its two consumers (src/js/teacher.js fetchPeriodGrades /
--  fetchAllPeriodGrades) and from the demo overlay that mirrors it
--  (src/js/demoDb.js computePeriodScore). Before running this on a project
--  that already has the view, open Dashboard → Database → Views, diff the
--  two, and keep whichever is authoritative. Replacing a correct view with
--  a subtly different one silently changes every student's reported grade.
--
--  Contract the client depends on — these column names are load-bearing:
--    student_id, class_subject_teacher_id, grading_period_id,
--    period_score, graded_count, total_assignments
--
--  Scoring, matching demoDb.js:
--    · each graded assignment scores score / max_score * 100
--    · percentages average within their category
--    · categories combine weighted by grade_categories.weight, renormalized
--      over only the categories that have graded work
--    · uncategorized work takes the leftover weight (100 − defined total)
--    · flat average across all graded work when no weighting applies
--    · period_score is null when the student has nothing graded yet
--
--  security_invoker = true is ESSENTIAL (and needs Postgres 15+). A view
--  defaults to running as its owner, which would bypass RLS entirely and
--  let any authenticated user read every student's grades through it.

create or replace view public.student_period_grades
with (security_invoker = true) as
with graded as (
  select
    a.class_subject_teacher_id            as cst_id,
    a.grading_period_id                   as grading_period_id,
    ag.student_id                         as student_id,
    a.category_id                         as category_id,
    (ag.score / a.max_score) * 100.0      as pct
  from public.assignments a
  join public.assignment_grades ag on ag.assignment_id = a.id
  where ag.score is not null
    and a.max_score > 0
),
-- Leftover weight is what uncategorized work inherits when the defined
-- category weights don't reach 100.
leftover as (
  select
    class_subject_teacher_id                        as cst_id,
    greatest(0, 100 - coalesce(sum(weight), 0))     as uncat_weight
  from public.grade_categories
  group by class_subject_teacher_id
),
per_category as (
  select
    g.cst_id,
    g.grading_period_id,
    g.student_id,
    avg(g.pct)                                          as cat_pct,
    coalesce(gc.weight, l.uncat_weight, 0)::numeric      as weight
  from graded g
  left join public.grade_categories gc on gc.id = g.category_id
  left join leftover l on l.cst_id = g.cst_id
  group by g.cst_id, g.grading_period_id, g.student_id,
           g.category_id, gc.weight, l.uncat_weight
),
weighted as (
  select
    cst_id, grading_period_id, student_id,
    sum(cat_pct * weight) filter (where weight > 0) as w_num,
    sum(weight)           filter (where weight > 0) as w_den
  from per_category
  group by cst_id, grading_period_id, student_id
),
flat as (
  select
    cst_id, grading_period_id, student_id,
    avg(pct)  as flat_pct,
    count(*)  as graded_count
  from graded
  group by cst_id, grading_period_id, student_id
),
totals as (
  select
    class_subject_teacher_id as cst_id,
    grading_period_id,
    count(*)                 as total_assignments
  from public.assignments
  group by class_subject_teacher_id, grading_period_id
),
-- One row per student per period the subject has work in, so the gradebook
-- can render an ungraded student as a blank rather than a missing row.
-- Unioned with `graded` so a student who changed class keeps their history.
base as (
  select cst.id as cst_id, t.grading_period_id, s.id as student_id
    from public.class_subject_teachers cst
    join public.students s on s.class_id = cst.class_id
    join totals t on t.cst_id = cst.id
  union
  select cst_id, grading_period_id, student_id from graded
)
select
  b.student_id                                        as student_id,
  b.cst_id                                            as class_subject_teacher_id,
  b.grading_period_id                                 as grading_period_id,
  round(
    case
      when w.w_den > 0 then w.w_num / w.w_den
      else f.flat_pct
    end, 2)::numeric(5,2)                             as period_score,
  coalesce(f.graded_count, 0)::integer                as graded_count,
  coalesce(t.total_assignments, 0)::integer           as total_assignments
from base b
left join weighted w
       on w.cst_id = b.cst_id
      and w.grading_period_id = b.grading_period_id
      and w.student_id = b.student_id
left join flat f
       on f.cst_id = b.cst_id
      and f.grading_period_id = b.grading_period_id
      and f.student_id = b.student_id
left join totals t
       on t.cst_id = b.cst_id
      and t.grading_period_id = b.grading_period_id;

-- ── demo_teacher_id() ──────────────────────────────────────────
-- NOT created here on purpose. It is a demo-only RPC that hands the shared
-- demo account a teacher identity (src/js/teacher.js calls it only when
-- DEMO_MODE is on; e2e/fixtures.js stubs it). On a real school project a
-- teacher is resolved from teachers.auth_user_id, and shipping a function
-- that hands out someone else's teacher id would be a hole, not a feature.
