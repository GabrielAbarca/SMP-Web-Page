# Backups & restore

A school hands over its students' records on the understanding that they will
still be there next term. This document is how that promise is kept: what
backups exist per project, how to take one that does not depend on the hosting
plan, and — the part that actually matters — how to prove a restore works
before the day you need it.

**An untested backup is not a backup.** The only evidence that a backup is
restorable is a restore you have performed. Section 3 is the drill; section 4
is the log of when it was last run.

---

## 1. Confirm automated backups, per project

Check this for **every** project, not once for the organisation. Dashboard →
Database → Backups.

| Plan       | What you get                   | What to do                                                                                                                                           |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free       | **No automated backups.**      | Never acceptable for a school holding real records. Either upgrade before onboarding, or run the scheduled dump in §2 and treat it as the only copy. |
| Pro        | Daily backups, 7-day retention | The minimum for a real school. Confirm the toggle is on and that a recent backup is listed.                                                          |
| Pro + PITR | Point-in-time recovery         | Worth it when losing a day of attendance and grading is unacceptable. Restores to a chosen moment rather than the last nightly.                      |

Record, per project: the plan, whether backups are listed as running, the date
of the most recent one, and whether PITR is enabled. A project whose backup
list is empty is a project with no backups, regardless of the plan.

> The demo project needs none of this — it holds invented data and is
> rebuilt from `supabase/schema/`. Everything here is about school projects.

---

## 2. Take a logical dump (works on any plan)

Useful as a pre-change safety net, for moving a project, and as the input to
the restore drill. Uses the `supabase` CLI already in this repo's
devDependencies.

Get the connection string from Dashboard → Settings → Database.

```bash
DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
STAMP=$(date +%Y%m%d)

# 1. Application data and schema (the public schema).
npx supabase db dump --db-url "$DB_URL" -f "smp_<school>_${STAMP}_public.sql"

# 2. The accounts. NOT included above.
npx supabase db dump --db-url "$DB_URL" --schema auth -f "smp_<school>_${STAMP}_auth.sql"
```

**Take both.** The public dump holds every student, grade and attendance
record but no logins; restoring it alone produces a complete school that
nobody can sign in to, with `auth_user_id` references pointing at users that
no longer exist. The auth dump is what makes the restore usable.

Not in either dump, and needed to make a restored project work:

- the `admin-users` Edge Function (redeploy it — see the runbook, §3);
- project settings: Auth URL configuration, email templates, API keys;
- storage objects, if the school uses student photos.

### Dump hygiene

These files contain named children's records in plain text.

- Never commit one, anywhere, for any reason.
- Keep them encrypted at rest, on storage only the operator can reach.
- Delete them on a fixed schedule — **[PLACEHOLDER: retention period, e.g. 30
  days]** — and record deletions.
- Never send one over chat or email.

---

## 3. The restore drill

Run this **before onboarding a school** and **quarterly** thereafter. It takes
about half an hour and is the only thing that turns "we have backups" into
something you can say to a director honestly.

### 3.1 Restore into a scratch project

1. Create a new, empty Supabase project (`SMP Restore Drill <date>`). Never
   restore into the live project — the point is to test the copy, not to risk
   the original.
2. Apply the dumps, auth first so the `auth_user_id` foreign keys resolve:

   ```bash
   SCRATCH='postgresql://postgres:<password>@db.<scratch-ref>.supabase.co:5432/postgres'
   psql "$SCRATCH" -f smp_<school>_<date>_auth.sql
   psql "$SCRATCH" -f smp_<school>_<date>_public.sql
   ```

3. Redeploy the Edge Function:

   ```bash
   supabase functions deploy admin-users --no-verify-jwt --project-ref <scratch-ref>
   ```

4. Configure Auth URLs on the scratch project (runbook §5), otherwise password
   recovery in the verification below lands on the wrong page.

### 3.2 Verify the restore

Do not skip to the last step. Each of these catches a different failure.

**Row counts match the source.** Run on both projects and compare:

```sql
select 'students' t, count(*) from public.students
union all select 'teachers', count(*) from public.teachers
union all select 'guardians', count(*) from public.guardians
union all select 'attendance', count(*) from public.attendance
union all select 'assignment_grades', count(*) from public.assignment_grades
union all select 'student_grades', count(*) from public.student_grades
union all select 'discipline_records', count(*) from public.discipline_records
order by 1;
```

**Accounts came across.**

```sql
select count(*) from auth.users;
select count(*) from public.students where auth_user_id is not null;
select count(*) from public.teachers where auth_user_id is not null;
```

A restore with students but zero linked accounts means the auth dump was
missed — the most common way a restore looks fine and is not.

**Security came across too.** A restore that loses its policies is a data
breach wearing a working app: every screen renders, and every user can read
everything.

```sql
select count(*) from pg_policies where schemaname = 'public';
```

Compare against the source. Then run the real check:

```bash
psql "$SCRATCH" -f supabase/schema/rls_audit.sql
```

It must end with `RLS AUDIT: ALL CHECKS PASSED`. This is the step that makes
the whole drill worth doing — it proves the restored copy is not just present
but safe.

**The app actually works.** Point a local build at the scratch project
(runbook §5, with `VITE_DEMO_MODE=false`) and confirm:

- an administrator can sign in and see the school's real structure;
- a student sees their own grades and nothing else;
- the teacher gradebook loads a section (this is also the check that
  `student_period_grades` survived — it is a view, and views are easy to lose);
- **password recovery** works: send a reset from the login page and follow the
  emailed link. Auth URL configuration is per project and does not come from
  the dump.

### 3.3 Finish

Delete the scratch project. Record the result below — including failures,
which are the entries worth having.

---

## 4. Drill log

Keep every row. A failed drill that was fixed is more reassuring than an empty
table.

| Date            | Project restored | Performed by | Result | Notes                                                         |
| --------------- | ---------------- | ------------ | ------ | ------------------------------------------------------------- |
| _(not yet run)_ |                  |              |        | Fill in at the first drill, before the first school onboards. |

---

## 5. If you actually need a restore

In the real event, do not overwrite the damaged project first.

1. **Stop writes.** Tell the school to stay out of the app while you work.
2. **Find out what happened and when.** The recovery point depends on it: a bad
   import needs PITR to just before it, hardware loss needs the latest nightly.
3. **Restore into a new project**, per §3.1, and verify with §3.2.
4. **Switch over** by pointing `VITE_SUPABASE_URL` (and
   `VITE_EXPECTED_PROJECT_REF`) at the restored project and redeploying.
5. **Keep the damaged project** until the school confirms the restored data is
   right. It is the only remaining copy of anything the backup missed.
6. **Tell the school what was lost.** Any window between the backup and the
   incident is gone. They need to know its size so they can re-enter what they
   have on paper — a silent gap in attendance or grades is worse than a known
   one.

---

## Related

- [ONBOARDING_RUNBOOK.md](ONBOARDING_RUNBOOK.md) — provisioning, schema, env
  configuration
- [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md) — password and access recovery
- [`supabase/schema/rls_audit.sql`](../supabase/schema/rls_audit.sql) — the
  verification step in §3.2
