# QA List

Post-modularization QA tracker (`task2.md`). One line per finding: path — core
issue, one sentence of cause. No long descriptions. Tick when fixed and keep the
entry for the record.

## Open

- [ ] `src/js/teacherNav.js:36` — `showSection` sets `state.loaded.today` before
      calling the loader and `loadToday`'s early return never clears it, so a
      failed teacher-context resolve leaves Today stuck with no retry on revisit.
      Predates the split.

## Resolved

- [x] `src/js/teacher.js` — Today tab never loaded on first paint: the teacher.js
      split (`5aa702c`) dropped the bootstrap's `showSection("today")`, leaving the
      static skeleton until a tab switch. (task2 #1)
