# SMP Admin Console — Create-Flow Fix Pass · Phase 1 Findings Report

## Context

The admin console's Create/Add flows have a set of blockers (routing, modal data
loss, broken checkboxes, unvalidated grading weights/dates), a missing shared
validation layer, and UX/information-design gaps. This report confirms each item
against the code, states root causes, proposes fixes with exact bilingual
strings, and answers Q1–Q4. Implementation runs in P0 → P1 → P2 order, one
feature branch per tier.

Everything below stays vanilla JS, no new dependencies, and reuses the existing
patterns: the `openModal` field-spec builder (`src/js/admin.js:127`), the
`Gateway`/demo-overlay data layer (`src/js/adminData.js`, `src/js/adminDemoDb.js`),
and the i18n layer (`src/js/i18n.js`, dictionaries in `src/js/i18n/en.js` + `es.js`).

---

## P0 — Blockers

### 1. Role-based routing stops at the login page — CONFIRMED (demo-mode gate)

**Evidence.** The role machinery is complete and unit-tested: `fetchRole()` /
`portalPath()` in `src/js/role.js:24-56` (tests in `test/role.test.js`), and the
admin page guard works (`src/js/admin.js:38-48`). The break is in
`src/js/login.js:17-20`:

```js
const target = DEMO_MODE ? "/" : portalPath(await fetchRole());
```

`DEMO_MODE` defaults **ON** (`src/js/demoMode.js:4`), so every demo deployment
sends everyone — including admins — to the student dashboard. The comment says
this was deliberate pre-admin-console behavior: _"the finished admin console
flips this landing later."_ The student portal only bounces role-holders who
have **no** linked student row (`src/js/main.js:40-58`); the shared demo account
has one, so an admin stays stuck on `/` and must hand-type `/admin`.

**Fix.** Remove the `DEMO_MODE` branch in `redirectToPortal()` so both call
sites (session-restore, post-sign-in) route through
`portalPath(await fetchRole())`. The shared demo profile carries the `admin`
role (per `src/js/teacher.js:57-59`), so the demo will now land in the admin
console. No new strings.

> ⚠ Side effect to be aware of: the public demo's landing page changes from the
> student dashboard to the admin console. This is what the code comment
> anticipated, and what this item asks for — flagging it for awareness.

### 2. Outside-click closes modals and destroys form progress — CONFIRMED

**Evidence.** `src/js/admin.js:262-264`:

```js
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
```

`closeModal()` (251-258) wipes `modalForm.innerHTML` with no dirty check. Same
pattern on the confirm overlay (296-298, harmless — no form), the schedule
overlay (1801-1803, **out of scope** — schedule editing), and the CSV import
overlay (3061-3063 — see re-scoping note at the end).

**Fix (generic add/edit modal).**

- Remove the overlay-click close entirely — the modal closes only via X or Cancel.
- Track dirtiness with one delegated `input` listener on `modalForm` (set on
  `openModal`, reset on `closeModal`).
- X / Cancel when dirty → reuse the existing confirm overlay via a generalized
  `openConfirm(message, onConfirm, { titleKey, confirmKey, danger })` (today its
  title/button are hard-wired to Delete, `admin.html:716-752`); clean → close
  immediately.

**Strings** (new, under `console.confirm`):

| Key              | EN                                                       | ES                                                  |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `discardTitle`   | `Discard changes?`                                       | `¿Descartar cambios?`                               |
| `discardMessage` | `You have unsaved changes. Do you want to discard them?` | `Tienes cambios sin guardar. ¿Deseas descartarlos?` |
| `discard`        | `Discard`                                                | `Descartar`                                         |
| `keepEditing`    | `Keep editing`                                           | `Seguir editando`                                   |

### 3. Subject → grade-level checkboxes visually broken — CONFIRMED (CSS reset)

**Evidence.** Root cause is the global reset in `src/css/style.css:228-236`:

```css
* { margin: 0; padding: 0; outline: 0; appearance: none; border: 0; ... }
```

`appearance: none` strips native checkbox rendering, and nothing restores it
for checkboxes (only `.period-selector select` gets `appearance: auto`,
`style.css:987`; no `accent-color` or `[type="checkbox"]` rule exists anywhere
in `src/css/`). The generic `.modal-body input` styling (`src/css/admin.css:322-333`)
then dresses the checkbox as a tiny text box, so the only visible feedback is
the shared focus ring (`style.css:990-1004`) — exactly the reported "blue
outline that vanishes when another is clicked."

Note: the DOM `checked` state **does** toggle and submission does collect values
(`admin.js:227-230` reads `:checked`) — the breakage is purely visual, but it
makes multi-select unusable in practice.

**Fix (CSS-only).** In `admin.css`, target `.checkbox-item input[type="checkbox"]`:
restore `appearance: auto`, set `accent-color: var(--color-primary)`, a fixed
~1rem size, remove the text-input padding/background, and give `.checkbox-item`
a visible checked/hover treatment. No JS changes, no strings.

### 4. Grading-period weights never validated to total 100% — CONFIRMED

**Evidence.** The weight field only has `min:0 / max:100` attributes
(`src/js/admin.js:745-753`); `onSubmit` (755-772) saves without any sum check;
`renderPeriods` (670-708) shows no total; `setActiveYear`
(`src/js/adminData.js:103-109`, invoked from `admin.js:566-576`) activates a
year without looking at its periods. DB has no constraint
(`supabase/schema/school_schema.sql:168-177`).

**Fix.**

- **Running total:** after the periods table renders, show a total line/badge in
  the periods panel (`admin.html:295-332`), warning-styled when ≠ 100.
- **On save:** compute the prospective total (existing periods, minus the row
  being edited, plus the submitted value). Block totals **over** 100 with an
  inline field error; totals under 100 save but trigger a loud inline warning
  (periods are created one at a time, so intermediate states must remain
  saveable).
- **On activate:** if the year's periods don't total 100 (or has none), the
  "Set active" action opens a confirm dialog stating the total instead of
  activating silently.

**Strings** (new, under `console.periods`):

| Key             | EN                                                        | ES                                                                |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `totalWeight`   | `Total weight: {total}%`                                  | `Peso total: {total}%`                                            |
| `weightWarning` | `Period weights total {total}% — they should total 100%.` | `Los pesos de los períodos suman {total}% — deberían sumar 100%.` |
| `weightOver`    | `Period weights would exceed 100% (total {total}%).`      | `Los pesos de los períodos superarían el 100% (total {total}%).`  |

And under `console.years`:

| Key                  | EN                                                                         | ES                                                                                           |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `activateWeightWarn` | `This year's period weights total {total}%, not 100%. Activate it anyway?` | `Los pesos de los períodos de este año suman {total}%, no 100%. ¿Activarlo de todas formas?` |
| `activateAnyway`     | `Activate anyway`                                                          | `Activar de todas formas`                                                                    |

### 5. Period dates not constrained to the parent school year — CONFIRMED

**Evidence.** The period form's date fields (`src/js/admin.js:731-744`) have no
`min`/`max` (the field spec already supports them, `admin.js:204-206`), no range
check in `onSubmit`, and nothing prevents `end < start` (same gap in the school
**year** form, `admin.js:609-647`). Server-side: `grading_periods`
(`school_schema.sql:168-177`) has no date constraints, and a CHECK can't
reference the parent `school_years` row — a trigger is required.

**Fix.**

- **Client:** set `min`/`max` on both date inputs from
  `state.activeYear.start_date/end_date`, and validate via the shared module
  (item 6): start ≥ year start, end ≤ year end, end > start. Year form gets
  end > start.
- **Server:** new snippet `supabase/schema/incremental_grading_period_bounds.sql`
  — a trigger function on `grading_periods` insert/update that raises when the
  dates fall outside the parent year or `start_date > end_date`.

> ⚠ **Database change.** The SQL lives in the repo and is applied by hand per
> `docs/ONBOARDING_RUNBOOK.md` — the demo project's schema is managed out of
> band, so nothing here is auto-applied.

**Strings:** covered by the shared validation strings in item 6
(`validation.dateWithin`, `validation.endAfterStart`).

---

## P1 — Validation layer (one work item)

### 6. Shared validation module with inline bilingual errors — CONFIRMED gap

**Evidence.** `openModal` relies on native browser validation only
(`required`/`min`/`max` attributes, `src/js/admin.js:153,203-206`) — errors
surface as native popups. Worse, the coercer `num()` (`admin.js:109-111`) turns
unparseable input into `NaN` bound for the DB. The **login page already has the
right pattern** — inline errors + `.input-error` wrapper class + an email regex
(`src/js/login.js:142,200-212`; CSS `src/css/login.css:419,455`) — but it isn't
shared.

**Fix.** New logic-layer module `src/js/validate.js` (JSDoc-typed, Vitest-covered
in `test/validate.test.js`), plus `openModal` integration:

- Rule set: `required`, `email` (reuse the login regex), `phone`
  (`/^[\d+\-\s]+$/` — digits, `+`, `-`, spaces only), `integer`, `number`,
  `range(min,max)`, `percent` (0–100), `dateWithin(min,max)`, `endAfterStart`,
  `unique(existingValues, currentId)`.
- `openModal` field specs gain a `validate` list; the form gets
  `noValidate = true`; on submit each failing field renders a
  `<small class="field-error">` under the input and an `.input-error` class on
  the group (same class names as login.css; small CSS addition to admin.css);
  first invalid field is focused. Errors clear on input.
- Per-form wiring (create forms only, per scope):
  - **Year:** dates valid, end > start.
  - **Period:** `period_order` positive integer; dates within active year;
    weight percent 0–100 (+ item 4 sum rules).
  - **Grade level:** `numeric_level` positive integer; name + level unique vs
    `state.gradeLevels` (DB is unique — this makes the error inline instead of a
    raw DB toast).
  - **Room:** name unique vs `state.rooms`; capacity integer ≥ 1 when given.
  - **Section:** capacity integer ≥ 1; **if a room is chosen and it has a
    capacity, section capacity ≤ room capacity** (see Q4 — nothing enforces
    this today).
  - **Subject:** name required; code unique vs `state.subjects`.
  - **Teacher:** email format; phone format; national ID unique vs
    `state.teachers`.
  - **Student:** enrollment # unique vs `state.students` (excluding self);
    email format; phone format; date of birth not in the future.
  - **Create-login modal:** email format; password ≥ 6 chars (Supabase's
    minimum, cf. `login.validation.password`).

**Strings** (new top-level `validation` group in both dictionaries — shared by
design, like `common`):

| Key               | EN                                                                            | ES                                                                                  |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `required`        | `This field is required.`                                                     | `Este campo es obligatorio.`                                                        |
| `email`           | `Enter a valid email address.`                                                | `Ingresa un correo electrónico válido.`                                             |
| `phone`           | `Only digits, spaces, + and - are allowed.`                                   | `Solo se permiten dígitos, espacios, + y -.`                                        |
| `integer`         | `Enter a whole number.`                                                       | `Ingresa un número entero.`                                                         |
| `number`          | `Enter a valid number.`                                                       | `Ingresa un número válido.`                                                         |
| `min`             | `Must be at least {min}.`                                                     | `Debe ser al menos {min}.`                                                          |
| `max`             | `Must be at most {max}.`                                                      | `Debe ser como máximo {max}.`                                                       |
| `percent`         | `Enter a percentage between 0 and 100.`                                       | `Ingresa un porcentaje entre 0 y 100.`                                              |
| `dateWithin`      | `Must be within {start} – {end}.`                                             | `Debe estar entre {start} y {end}.`                                                 |
| `endAfterStart`   | `End date must be after the start date.`                                      | `La fecha de fin debe ser posterior a la fecha de inicio.`                          |
| `unique`          | `"{value}" is already in use.`                                                | `"{value}" ya está en uso.`                                                         |
| `enrollmentTaken` | `Enrollment number {value} is already in use.`                                | `El número de matrícula {value} ya está en uso.`                                    |
| `capacityRoom`    | `Section capacity ({capacity}) exceeds the room's capacity ({roomCapacity}).` | `El cupo de la sección ({capacity}) supera la capacidad del aula ({roomCapacity}).` |
| `futureDate`      | `The date can't be in the future.`                                            | `La fecha no puede estar en el futuro.`                                             |
| `password`        | `Password must be at least 6 characters.`                                     | `La contraseña debe tener al menos 6 caracteres.`                                   |

### 7. National ID optional + per-school label — HALF-CONFIRMED

**Evidence.** The "optional" half is **already true**: neither create form marks
it required (teacher `src/js/admin.js:1440-1444`, student `1993-1996`) and both
DB columns are nullable (`school_schema.sql:71,127`). The configurable-label
half has nothing to build on: the label is the fixed i18n pair
`console.teachers.nationalId` / `console.students.nationalId`
("National ID" / "Cédula"), also used by the table headers
(`admin.html:517,600`). No school settings entity exists (see Q3).

**Fix (pending Q3 approval).**

- Load `school_settings` once at admin boot (tolerating a missing table →
  fall back to i18n defaults, since the demo project's schema is managed out of
  band).
- A tiny `idLabel()` helper in `admin.js` returns the configured label or the
  translated default; use it for the teacher/student form fields and the two
  table headers. No custom-fields system.
- A small editable "School profile" card on the Settings tab
  (`admin.html:613-617`, `loadSettings` at `admin.js:3068`) with school name +
  ID label, saved through the normal gateway (demo-safe: writes land in the
  overlay).

**Strings** (new, under `console.school`):

| Key           | EN                                                                                                             | ES                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | `School profile`                                                                                               | `Perfil de la escuela`                                                                                                                      |
| `name`        | `School name`                                                                                                  | `Nombre de la escuela`                                                                                                                      |
| `idLabel`     | `ID field label`                                                                                               | `Etiqueta del campo de identificación`                                                                                                      |
| `idLabelHelp` | `What the ID field is called at this school (e.g. "Cédula", "DUI", "School ID"). Leave blank for the default.` | `Cómo se llama el campo de identificación en esta escuela (p. ej. "Cédula", "DUI", "Carné"). Déjalo en blanco para usar el predeterminado.` |
| `saved`       | `School profile saved.`                                                                                        | `Perfil de la escuela guardado.`                                                                                                            |

---

## P2 — UX & information design

### 8. Nav tabs in dependency order — CONFIRMED (plus one structural change)

**Evidence.** Current sidebar order (`admin.html:85-129`): Overview →
Year & Periods → Grades & Sections → Subjects → Teachers → Students → Settings.
**Assignments is not a tab** — it's a second panel inside the Teachers view
(`admin.html:531-557`, loaded by `loadTeachers` → `loadAssignments`,
`admin.js:1302`).

**Fix.** Reorder the sidebar to: Overview → **Year & Periods → Teachers →
Grades & Sections → Subjects → Assignments → Students & Enrollment** → Settings
(Overview stays the landing page; Settings stays last). Split the assignments
panel into its own `section#view-assignments` + sidebar entry + `LOADERS`
entry (`admin.js:355-363`); `loadAssignments` already self-loads
sections/subjects/grade levels and just needs an `ensureTeachers()` call.
Rationale: Teachers must precede Grades & Sections because the section form's
homeroom select draws from teachers.

**Strings** (new):

| Key                           | EN                  | ES                     |
| ----------------------------- | ------------------- | ---------------------- |
| `console.nav.assignments`     | `Assignments`       | `Asignaciones`         |
| `console.heading.assignments` | `Class Assignments` | `Asignación de clases` |

### 9. Homeroom optional + explanatory tooltip — HALF-CONFIRMED

**Evidence.** Already optional: the field has no `required` flag
(`src/js/admin.js:1079-1088`), so `openModal` gives it a "— None —" option and
`num("")` → `null` (`admin.js:1113`). What's missing is any explanation of what
a homeroom teacher is.

**Fix.** Use the existing `field.help` mechanism (`admin.js:211-216` renders
`small.field-help`) on the homeroom field — an always-visible bilingual hint,
which fits the modal pattern better than a hover-only tooltip (also works on
touch).

**Strings** (new, under `console.sections`):

| Key            | EN                                                                                                                           | ES                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `homeroomHelp` | `The homeroom teacher is the section's lead teacher and main contact for its students. Optional — you can assign one later.` | `El docente guía es el docente responsable de la sección y el contacto principal de sus estudiantes. Opcional — puedes asignarlo después.` |

### 10. Students filter labels — CONFIRMED

**Evidence.** `renderStudentFilter` (`src/js/admin.js:1866-1885`) builds a flat
list: "All sections" (`console.students.allSections`, `en.js:826` /
`es.js:819`), "Unassigned" (`unassigned`), then the sections. The aria-label is
"Filter by section" (`admin.html:574-576`).

**Fix.** Rename the first option to "All students"; reword "Unassigned" so it
reads as an enrollment status; wrap the real sections in an `<optgroup>` so the
two status options are visually separate from sections; update the aria-label.

**Strings** (under `console.students` — `allSections` replaced, `unassigned`
reworded, two added):

| Key                                           | EN                    | ES                      |
| --------------------------------------------- | --------------------- | ----------------------- |
| `allStudents` (replaces `allSections`)        | `All students`        | `Todos los estudiantes` |
| `unassigned` (reworded)                       | `No section assigned` | `Sin sección asignada`  |
| `sectionsGroup`                               | `Sections`            | `Secciones`             |
| `filterStudents` (replaces `filterBySection`) | `Filter students`     | `Filtrar estudiantes`   |

### 11. Section selector shows raw codes — CONFIRMED

**Evidence.** `sectionName()` (`src/js/admin.js:1003-1005`) prefers
`display_name`, which the create flow composes as
`${numeric_level}${sectionCode}` (`admin.js:1112`, import `2707`) — grade 10 +
section "10-1" → **"1010-1"**. The student portal instead renders
`student.classLine` = `"{grade} — Section {section}"` / `"{grade} — Sección
{section}"` (`en.js:207` / `es.js:200`, used in `src/js/main.js:265-271`).

**Fix.** Change `sectionName(sec)` to
`t("student.classLine", { grade: gradeName(sec.grade_level_id), section: sec.section })`
with a `display_name || section` fallback when the grade list isn't loaded.
Cross-scope string reuse is precedented (`main.js` reuses `admin.demo.*`). This
fixes every consumer at once: at-risk table, assignments table + form options,
schedule-modal title, students table, student form, students filter, import
target. The Sections table keeps its separate Grade / Section columns. No new
strings.

Nuance to note: the student portal passes `display_name` (e.g. "10A") as
`{section}` while this fix passes the bare code (e.g. "A"), matching the task's
"10th — Section A" example. Aligning the student portal is out of scope here.

### 12. Admin dashboard rework — CONFIRMED

**Evidence.** Overview = welcome card + active year (`admin.html:160-183`),
three stat cards (enrollment / attendance today / at-risk count,
`admin.html:185-223`), and a full per-student at-risk table
(`admin.html:225-251`, built by `loadOverviewStats`/`renderAtRisk`,
`src/js/admin.js:447-524`). No school name anywhere; no teacher/subject/section
counts; no room utilization.

**Fix.**

- **School-name header** (depends on Q3): when `school_settings.name` is set,
  render it as the Overview heading (fallback: current
  `console.heading.overview`).
- **New count cards:** total teachers, total subjects, total sections (active
  year), rooms in use — computed from `listTeachers()` / `listSubjects()` /
  already-loaded sections / `listRooms()` added to the existing `Promise.all`.
  Room utilization = distinct rooms referenced by active-year sections over
  total rooms, shown as `{used}/{total}`.
- **Demote at-risk:** delete the table panel and `renderAtRisk`; the existing
  "At-risk students" count card (`stat-atrisk`) already is the "single summary
  figure" the item asks for. Remove the now-unused `atRiskTitle` / `atRiskSub` /
  `student` / `section` / `absences` / `atRiskEmpty` keys from both dictionaries.

**Strings** (new, under `console.overview`):

| Key        | EN             | ES             |
| ---------- | -------------- | -------------- |
| `teachers` | `Teachers`     | `Docentes`     |
| `subjects` | `Subjects`     | `Materias`     |
| `sections` | `Sections`     | `Secciones`    |
| `roomUse`  | `Rooms in use` | `Aulas en uso` |

---

## Open questions

**Q1 — Admin UI to create class schedules: EXISTS.** Each row in the Sections
table has a "Schedule" action (`src/js/admin.js:1027-1029`) opening a
per-section modal (`admin.html:754-789`, `admin.js:1622-1803`) that lists weekly
entries and has an add form with day / start / end / subject / teacher / room,
end-after-start validation, and same-section overlap detection
(`admin.js:1755-1791`). **Not a P0 gap.** Known limitations for a later pass:
no edit-in-place (delete + re-add only), and no cross-section teacher/room
double-booking check.

**Q2 — CSV roster import: EXISTS.** Students: "Import CSV" button
(`admin.html:577-583`) → a three-step wizard (source → column mapping →
preview/validate) driven by `IMPORT_DESCRIPTORS.students`
(`src/js/admin.js:2088-3063`), on the dependency-free parser/auto-mapper in
`src/js/csv.js` (tested in `test/csv.test.js`). The same wizard covers teachers,
subjects, grade levels, rooms, sections, school years, and grading periods. Not
modified in this pass.

**Q3 — School settings/profile entity: NONE.** The only candidate,
`app_config` (`school_schema.sql:31-34`), is a text-keyed key/value table with
no `id` column — incompatible with the generic `Gateway`/demo-overlay contract
(both key rows by numeric `id`: `adminData.js:30-31`, `adminDemoDb.js:118-137`)
— and it's used for demo plumbing (`demo_teacher_id`, `teacher.js:64,108`).
**Proposal — minimal single-row table** (new file
`supabase/schema/incremental_school_settings.sql`, also appended to the
baseline `school_schema.sql`):

```sql
create table public.school_settings (
  id integer primary key default 1 check (id = 1),
  name text,
  logo_url text,
  id_label text,
  created_at timestamptz default now()
);
alter table public.school_settings enable row level security;
create policy "Admins have full access to school_settings" on public.school_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated can read school_settings" on public.school_settings
  for select using (auth.role() = 'authenticated');
```

Single row (`check (id = 1)`) fits the id-keyed gateway and the demo overlay
as-is. **Awaiting approval before creating it** (hard rule 5); until applied,
the frontend treats a failed read as "no settings" and falls back to defaults.

**Q4 — Section capacity vs room capacity: NOT ENFORCED ANYWHERE.** Client: the
section form only has a `min: 1` attribute (`src/js/admin.js:1096-1102`); rooms
allow `min: 0` (`929-932`); the sections CSV import defaults capacity to 30 with
no check (`2710`). DB: `classes.max_capacity` and `rooms.capacity` are bare
integers with no CHECKs (`school_schema.sql:119,54`). Item 6 adds the first
enforcement (client-side, create form).

---

## Proposed implementation order (Phase 2)

Each tier ends with `npm run lint && npm run typecheck && npm test && npm run build`,
a summary, and a pause.

1. **P0** — items 1 → 3 → 2 → 4 → 5 (routing and the checkbox CSS are isolated
   one-file fixes; then modal close behavior; then the two period-form
   validations, whose inline-error rendering seeds item 6). The item-5 SQL
   snippet is written to the repo but **not applied** without explicit approval.
2. **P1** — item 6 (`src/js/validate.js` + `openModal` integration + per-form
   rules + `test/validate.test.js`), then item 7 (label config; needs the Q3
   decision — if approval is withheld, item 7 ships as "optional confirmed +
   fallback labels" and item 12's school name falls back to the current heading).
3. **P2** — items 8 → 11 → 10 → 9 → 12 (nav split first since it moves markup
   other items touch; then the label/filter/tooltip changes; dashboard last).

**Verification.** Unit: Vitest for `validate.js` and the weight-total helper.
Browser: the Playwright e2e suite already drives the admin console against a
mocked Supabase (`e2e/smoke.spec.js:111+`) — extend it with: admin login lands
on `/admin.html`; outside-click no longer closes a dirty modal; checkboxes
render checked state; over-100% weight blocked; out-of-range period date
rejected. Manual dev-server pass in both languages (ES via the language
setting) for the new strings.

**Re-scoping recommendations.**

- **Import modal overlay-close:** same data-loss bug as item 2 (a pasted roster
  dies on a stray click, `admin.js:3061-3063`). CSV import behavior is formally
  out of scope — I recommend including _only_ the overlay-close removal (no
  import-logic changes). Will skip unless approved.
- **Schedule modal overlay-close:** left untouched (schedule editing is out of
  scope).
- **Student-portal side of item 11** (what `display_name` should contain /
  display): defer to a later pass.
- **Cross-section teacher/room clash detection** (Q1 note): defer; needs its own
  design.
- **Both DB artifacts** (item 5 trigger, Q3 table) are repo files + manual
  application per `docs/ONBOARDING_RUNBOOK.md` — never auto-applied.

**Git/process:** one feature branch per tier, created off `main` and merged back
via PR, with imperative commit messages.
