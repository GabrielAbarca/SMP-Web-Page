# CLAUDE.md

Working guide for AI agents (and humans) contributing to **SMP Dashboard**. Read this before making changes.

## Project overview

SMP Dashboard is a school-management web app for Latin American institutions. It is a **vanilla JavaScript (ES modules) multi-page app built with Vite** — there is **no frontend framework** (no React/Vue). Data comes from **Supabase** (Postgres, RLS, Auth, Realtime) and it deploys on **Vercel**.

Three HTML entry points, each with its own controller in `src/js/`:

| Page          | Purpose                    | Controller       |
| ------------- | -------------------------- | ---------------- |
| `login.html`  | Sign-in / sign-up          | `login.js`       |
| `index.html`  | Student dashboard          | `main.js`        |
| `admin.html`  | Admin console (CRUD)       | `admin.js`       |

The UI is bilingual (EN/ES) via a lightweight i18n layer.

## Commands

```bash
npm run dev           # Vite dev server
npm run build         # production build
npm run preview       # preview the build
npm run lint          # ESLint (flat config)
npm run format        # Prettier — write
npm run format:check  # Prettier — check only
npm run typecheck     # tsc --noEmit over checkJs + JSDoc
npm test              # Vitest unit tests (test/)
npm run test:e2e      # Playwright e2e (e2e/)
```

CI (`.github/workflows/ci.yml`) mirrors `lint` → `typecheck` → `test` → `build` plus the Playwright e2e suite on every PR. A husky pre-commit hook runs lint-staged (ESLint + Prettier on staged files). **Run `lint`, `typecheck`, `test`, and `build` locally before considering work done** — don't rely on CI to catch what you can catch first.

## Architecture

`src/js/` splits into two layers:

- **View controllers** — `admin.js`, `main.js`, `login.js`. DOM glue. These are **excluded from `typecheck`** (see `tsconfig.json`) and typed incrementally; keep them thin and push logic down into the layer below.
- **Logic layer** (type-checked, prefer JSDoc on new code):
  - `supabaseClient.js` — the Supabase client. **Throws if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing.**
  - `supabaseQueries.js` — all data fetching.
  - `demoMode.js` / `demoDb.js` — demo sandbox (see below).
  - `i18n.js` + `i18n/en.js`, `i18n/es.js` — translations.
  - `auth.js`, `theme.js`, `ui.js`, `settings.js`, `errorHandler.js`, `speedInsights.js`.

`errorHandler.js` installs a global error banner and **must remain the first import of every page entry point**. Don't reorder it below other imports.

### Demo mode (important)

`DEMO_MODE` defaults **ON** (`src/js/demoMode.js`; opt out with `VITE_DEMO_MODE=false`). `demoDb.js` is a **delta-overlay** wrapper around the real data layer: reads pass through to Supabase, then per-session in-memory deltas are applied; **writes only record deltas and never leave the browser**. When touching data flows, preserve this invariant — a demo-mode write must never reach Supabase.

## Hard rules

These are non-negotiable. They override default agent behavior.

1. **Branch per task.** Every task gets its **own new branch created off `main`** (e.g. `feat/…`, `fix/…`, `docs/…`). Never commit directly to `main` or `development` — branch even when the working branch is `development`. Create the branch before you start changing files.

2. **Commit finished work to that branch** with a **professional, straightforward commit message** (imperative mood, e.g. `Add attendance export to admin console`). No noise, no emoji-filler, no AI meta-commentary in the message.

3. **Claude is never an author, co-author, or contributor.** All commits are authored by the repository owner's git identity **only**. Do **not** add `Co-Authored-By: Claude …` trailers, `Generated with Claude Code` lines, or any similar attribution to commits or PR bodies. Nothing should surface Claude/AI in GitHub's contributor list or commit metadata. (This deliberately overrides the harness default of adding a co-author trailer.)

4. **Finished branches merge into `main` via PR.**

5. **Never touch Supabase RLS, Auth, migrations, or the database without asking first.**

6. **Clarify vague prompts.** Identify the underlying intent behind a request before acting. If scope, target, or intent is unclear, **ask** rather than assume — a wrong assumption is more expensive than a question.

## Conventions

- **Formatting**: Prettier is the source of truth (`.prettierrc.json`); don't hand-format against it.
- **Linting**: ESLint 10 flat config (`eslint.config.js`).
- **Typing**: JSDoc + `checkJs` (loose strictness, no `.ts` migration). Add JSDoc to new logic-layer code; the three view controllers are typed incrementally.
- **Tests**: unit tests in `test/` (Vitest); e2e in `e2e/` (Playwright, self-contained with a dummy Supabase env — no real backend needed).

## Verification

For user-facing changes, verify in a real browser (dev server + Playwright, with the Supabase backend mocked for the admin console) — the `verify` skill documents the exact recipe. For logic changes, a Vitest unit test is preferred over a manual check.

## Environment

Requires a `.env` with:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# VITE_DEMO_MODE=false   # optional — turns the demo sandbox off
```
