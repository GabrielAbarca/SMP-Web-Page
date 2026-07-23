-- Incremental change: add teachers.auth_user_id.
--
-- This lives under supabase/schema/ (a plain artifact directory), NOT under
-- supabase/migrations/, on purpose: the demo project's schema is managed
-- out of band, so a lone file in supabase/migrations/ makes the Supabase↔
-- GitHub integration report a migration-history mismatch. Fresh per-school
-- projects already get this column from school_schema.sql; run this snippet
-- by hand only against an existing project that predates the column. It is
-- already applied to the shared demo project.
--
-- Link a teacher record to its auth user so real (non-demo) teacher logins
-- resolve to the right teacher record. Nullable + ON DELETE SET NULL so
-- removing an auth user never deletes the teacher. Teachers are already
-- readable by authenticated users (the existing "Authenticated users can read
-- teachers" policy), so a teacher can look up their own row by auth_user_id
-- with no new policy.
alter table public.teachers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
