---
name: verify
description: Verify SMP changes by driving the real app in a browser — dev server + Playwright, with a mocked Supabase backend for the admin console.
---

# Verifying SMP-Web-Page changes

Static Vite multi-page app (login.html / index.html / admin.html) against a
shared Supabase backend. `.env` holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Build & launch

```bash
npx vite build                      # bundle check only
npx vite --port 5199 --strictPort   # dev server (background)
```

## Drive (Playwright)

No repo Playwright dep — install into a temp dir (`npm i playwright`,
`npx playwright install chromium`), then script against `http://localhost:5199`.

**Login page** can be driven against the real network unauthenticated
(sign-up guard, validation, failed sign-in).

**Admin console** (`/admin.html`) needs an authenticated session with
`profiles.role === "admin"`; RLS hides all rows from anon and there are no
credentials in the repo. Mock at the network layer instead:

1. Seed localStorage before page scripts: key `sb-<project-ref>-auth-token`
   (ref = subdomain of the Supabase URL), value = a session JSON with a fake
   base64url JWT and far-future `expires_at` — `getSession()` accepts it
   without a network call.
2. `context.route("<SUPA>/**")`: answer `POST /rest/v1/rpc/demo_teacher_id`
   with `7`; answer REST GETs from per-table fixture arrays, applying
   `eq.` / `in.(…)` filters generically; return single object when the
   `Accept` header contains `vnd.pgrst.object`; 403 + log anything else.
3. Track every request; in demo mode assert zero non-GET to `/rest/v1/*`
   (except the rpc above).

A working harness (fixtures for all tables, session seed, router) exists in a
past session's scratchpad as `harness-lib.mjs` / `drive.mjs` — recreate from
this recipe if gone.

## Gotchas

- The roster **column-header** row shares `.roster-row-cells` with the
  clickable data rows — click `.roster-row .roster-row-cells` or you hit the
  inert header.
- Gradebook completion text is `{graded}/{total} graded` (e.g. `2/3 graded`).
- `getCurrentPeriodId()` picks the grading period whose start/end dates
  bracket today — make fixture periods cover the current date.
- Add-student, add-schedule, student edit/delete, schedule delete are
  admin-locked (`IS_ADMIN = false` in admin.js) — drive gradebook,
  attendance, categories, post-grades, discipline instead.
- Roster/gradebook re-render after async loads — wait on expected text, not
  just selectors, before clicking rows.
- `VITE_DEMO_MODE` defaults ON; set `VITE_DEMO_MODE=false` in `.env.local`
  to exercise real writes (needs a writable backend + credentials).
