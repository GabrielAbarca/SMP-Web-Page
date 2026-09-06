# QA List

Post-modularization QA tracker (`task2.md`). One line per finding: path — core
issue, one sentence of cause. No long descriptions. Tick when fixed and keep the
entry for the record.

## Open

_None._

## Resolved

- [x] `src/js/teacher.js` — Today tab never loaded on first paint: the teacher.js
      split (`5aa702c`) dropped the bootstrap's `showSection("today")`, leaving the
      static skeleton until a tab switch. (task2 #1)
- [x] `src/js/teacherContext.js` — a failed teacher-context resolve was
      unrecoverable and misreported as "no teacher record": resolution now records
      `state.contextError`, and Today / My Classes / Settings offer a retry that
      re-resolves instead of latching a dead end.
