# SMP — School Onboarding Runbook

How to stand up a **real** (non-demo) SMP instance for a school and run the
milestone acceptance test: _set up a complete fictional school — grading
periods, sections, subjects, 5 teachers, 50 students, schedules — entirely
through the Admin Console, from an empty database, in under an hour, without
touching Supabase directly._

The public demo (`VITE_DEMO_MODE` on, default) is a shared, read-only sandbox
and is **not** used for real schools. Each school gets its own Supabase project.

---

## 1. Provision the school's Supabase project

Either create a fresh project (Supabase dashboard → New project) or use the
one already provisioned for this milestone (see §7).

## 2. Apply the schema

Run [`supabase/schema/school_schema.sql`](../supabase/schema/school_schema.sql)
against the new project (dashboard SQL editor, or `supabase db execute`). It
creates the full 23-table schema, the `is_admin()` helper, the
`auth.users → profiles` trigger, and RLS policies — **admin full-access + the
student/teacher read policies, without the demo read-only lock**, so admins can
write. Id columns use identity (equivalent to the demo's sequences).

> Existing projects that already have the schema only need the incremental
> migration [`supabase/migrations/20260722000000_add_teacher_auth_user_id.sql`](../supabase/migrations/20260722000000_add_teacher_auth_user_id.sql)
> (the `teachers.auth_user_id` column). It is already included in
> `school_schema.sql`, so a fresh project does **not** need it separately.

## 3. Deploy the account Edge Function

Deploy [`supabase/functions/admin-users`](../supabase/functions/admin-users/index.ts)
to the project with JWT verification **off** at the platform level (the function
does its own admin-JWT check and needs the CORS preflight to pass):

```bash
supabase functions deploy admin-users --no-verify-jwt --project-ref <ref>
```

It uses the project's `SUPABASE_SERVICE_ROLE_KEY` from the runtime env — the key
never reaches the browser. It refuses any caller whose JWT isn't an admin.

## 4. Bootstrap the first admin

The Edge Function needs an admin to authorize account creation, so the **first**
admin is created out of band:

1. Dashboard → Authentication → Users → **Add user** (email + password, mark
   email confirmed).
2. SQL editor: `update public.profiles set role = 'admin' where id = '<the new user id>';`

## 5. Point the app at the project

Set env (e.g. Vercel project env, or `.env.local`) and deploy/build:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<the project's anon/publishable key>
VITE_DEMO_MODE=false
```

`VITE_DEMO_MODE=false` is what makes the console write for real (writes go to
Supabase instead of the in-browser demo overlay), routes logins by role, and
resolves teachers by `auth_user_id`.

## 6. Run the acceptance test (all through the UI)

Sign in as the admin → you land on `/admin`. Then, without touching SQL:

1. **Year & Periods** — create the school year, mark it active, add its 3
   grading periods.
2. **Grades & Sections** — add grade levels; add rooms; add the sections
   (grade + section + homeroom + room + capacity).
3. **Subjects** — add subjects and tick which grades take each.
4. **Teachers** — add 5 teachers; under **Class assignments**, assign
   subject+teacher to each section. Use **Create login** on each teacher to
   issue their account (temp password).
5. **Students & Enrollment** — **Import CSV** your 50-student roster (map
   columns, choose the target section, import). Spot-check enrollment and use
   **Create login** where students need accounts.
6. **Overview** — confirm total enrollment, today's attendance rate, and the
   at-risk list populate.

**Done when:** the full school exists and it took under an hour, with no direct
Supabase access. Teachers/students created here can sign in and land in their
own portals.

---

## 7. Pre-provisioned pilot (ready now)

A pilot project was provisioned and verified for this milestone:

- **Project:** `SMP Pilot School` (ref `wklxkntdnzshyrijvnjj`)
- **URL:** `https://wklxkntdnzshyrijvnjj.supabase.co`
- Schema applied · `admin-users` function deployed · admin-write RLS verified.
- **Test admin:** `admin@pilot.smp` / `PilotAdmin#2026` (role `admin`).
- School data is empty (0 years / teachers / students) — the acceptance-test
  starting point.

To try it: build/preview with the three env vars from §5 (URL above, the
project's anon key, `VITE_DEMO_MODE=false`) and sign in with the test admin.

> This is a throwaway test project with a **public** password. Rotate or delete
> the test admin before using the project for anything real, and never reuse the
> password elsewhere.

---

## Notes & known items

- **Security advisor:** `is_admin()` / `handle_new_user()` show WARN-level
  "SECURITY DEFINER function is callable" lints — the standard Supabase auth
  pattern (the demo project has them too). `handle_new_user()` has EXECUTE
  revoked from `anon`/`authenticated` (trigger-only); `is_admin()` keeps EXECUTE
  for `authenticated` because RLS policies evaluate it.
- **Teacher gradebook on a real project:** this schema covers the admin console,
  student portal, and teacher identity. The teacher gradebook's helper view
  (`student_period_grades`) and demo-only `demo_teacher_id()` are not included —
  add them from the demo project if a school will use the teacher gradebook.
- **Deactivate:** the console's per-row deactivate flips the record `status`
  flag. Disabling the actual login (auth ban) is available via the Edge
  Function's `setActive` action.
