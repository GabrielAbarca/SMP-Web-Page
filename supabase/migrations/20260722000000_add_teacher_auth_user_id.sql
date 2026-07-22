-- Link a teacher record to its auth user so real (non-demo) teacher logins
-- resolve to the right teacher record. Nullable + ON DELETE SET NULL so
-- removing an auth user never deletes the teacher. Teachers are already
-- readable by authenticated users (the existing "Authenticated users can read
-- teachers" policy), so a teacher can look up their own row by auth_user_id
-- with no new policy.
--
-- Applied to the shared demo project and to every per-school project.
alter table public.teachers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
