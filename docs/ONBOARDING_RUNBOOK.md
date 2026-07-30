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
creates the full 27-table schema, the `is_admin()` helper, the
`auth.users → profiles` trigger, and RLS policies — **admin full-access + the
student/teacher read policies, without the demo read-only lock**, so admins can
write. Id columns use identity (equivalent to the demo's sequences).

> Existing projects that already have the schema only need the incremental
> snippets:
>
> - [`supabase/schema/incremental_teacher_auth_user_id.sql`](../supabase/schema/incremental_teacher_auth_user_id.sql)
>   — the `teachers.auth_user_id` column.
> - [`supabase/schema/incremental_grading_period_bounds.sql`](../supabase/schema/incremental_grading_period_bounds.sql)
>   — the trigger keeping each grading period inside its school year.
> - [`supabase/schema/incremental_school_settings.sql`](../supabase/schema/incremental_school_settings.sql)
>   — the single-row `school_settings` table (school name, logo, and the
>   per-school label for the national-ID field).
> - [`supabase/schema/incremental_schedules.sql`](../supabase/schema/incremental_schedules.sql)
>   — the Schedules tab: `schedule_configs` (active days + structure type
>   per year), `bell_schedules` / `bell_schedule_blocks` (reusable time-block
>   templates), the widened `schedules.day_of_week` check (1–7, so Saturday
>   schools work), and the missing `Authenticated can read schedules` policy
>   without which the teacher console's schedule view comes back empty.
>   Verify the generated name of the day-of-week check constraint on the
>   target project (`\d public.schedules`) before running the `alter table`.
>
> All of them are already included in `school_schema.sql`, so a fresh project
> does **not** need them separately.
> (They live under `supabase/schema/`, not `supabase/migrations/`, so the
> Supabase↔GitHub integration doesn't try to sync them to the demo project.
> Apply them with the dashboard SQL editor — do **not** register them as
> migrations, or the integration reports a history mismatch.)
>
> Applied to both existing projects (demo `SMP DataBase` and `SMP Pilot
School`) as of this milestone. On the demo project, `school_settings` also
> carries the restrictive `demo_deny_*` policies the other tables have, so the
> sandbox stays read-only server-side.
>
> Same for the schedules tables: `schedule_configs`, `bell_schedules` and
> `bell_schedule_blocks` carry `demo_deny_insert/update/delete` on the demo
> project (restrictive, `anon` + `authenticated`), so all 27 public tables
> there are locked. A real school project must **not** have them — admins
> need to write. Whenever a table is added, remember the lock is a separate,
> out-of-band step: the incremental snippets deliberately don't carry it.

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

Then point the project back at the app — Dashboard → Authentication → **URL
Configuration**. Supabase defaults Site URL to `http://localhost:3000`, and
that default is where every password-recovery email lands until it's changed:

| Field         | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Site URL      | the school's deployed origin, e.g. `https://smp-web-page.vercel.app` |
| Redirect URLs | `<deployed origin>/**`                                               |
| Redirect URLs | `http://localhost:3000/**` (dev — Vite's port, see `vite.config.js`) |

Only allow-listed URLs are honoured as redirect targets, and that allow-list is
the boundary that keeps the `redirectTo` the console sends from being an open
redirect. Skipping this leaves recovery links pointing at `/`, the student
dashboard, which consumes the token and signs the user in with no way to set a
password.

Optional, and worth it for schools on enterprise mail: some scanners pre-fetch
links and burn the single-use token, so the recipient gets
`error_code=otp_expired` on their first click. Switching the _Reset Password_
template (Authentication → Emails) to a token-hash link avoids it — nothing is
spent until the page itself exchanges the token:

```html
<a href="{{ .SiteURL }}/login.html?token_hash={{ .TokenHash }}&type=recovery">
  Reset password
</a>
```

The login page already handles both that shape and the default one.

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

Every structure section has an **Import CSV** button too, so you can bulk-load
school years, grading periods, grade levels, rooms, sections, subjects and
teachers from a spreadsheet — not just students. The importer auto-maps
columns, resolves references by name (e.g. a section's grade/homeroom/room),
validates each row, and previews before writing.

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
- **Password recovery:** anyone can start one from the login page's **Forgot
  password?**, and an admin can send one for a specific login from the console.
  Either way the emailed link comes back to `/login`, which detects it and asks
  for a new password. Both paths depend on §5's URL configuration — without it
  the link lands on the student dashboard instead.
