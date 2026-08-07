# Design-review captures

Screenshots of SMP Dashboard for an external design critique. Nothing in the
app was changed to produce them — this is the shipped UI, running against the
e2e harness's mocked Supabase origin so the screens are populated with
realistic rows instead of a live school's records.

Regenerate with:

```bash
npx playwright test --config playwright.capture.config.js
```

(Its own config on purpose: the capture files don't match Playwright's default
`*.spec.js` pattern, so `npm run test:e2e` and CI never pick them up.)

| File                           | Screen                                       | Viewport | PNG       |
| ------------------------------ | -------------------------------------------- | -------- | --------- |
| `01-login.png`                 | Login (demo mode, credentials prefilled)     | 1440×900 | 1440×900  |
| `02-admin-dashboard.png`       | Admin overview, populated                    | 1440×900 | 1440×900  |
| `03-admin-students-list.png`   | Students & Enrollment, 14-row table          | 1440×900 | 1440×1089 |
| `04-admin-modal-error.png`     | Add student modal, 4 inline field errors     | 1440×900 | 1440×900  |
| `05-teacher-gradebook.png`     | Teacher console → 7A Mathematics → Gradebook | 1440×900 | 1440×900  |
| `06-admin-dashboard-empty.png` | Admin overview, brand-new school (no data)   | 1440×900 | 1440×900  |
| `07-student-portal-mobile.png` | Student portal dashboard                     | 375×812  | 375×1390  |

All full-page except `04`, which is viewport-sized: the modal overlay is
`position: fixed`, so a full-page shot stretches the canvas to the scroll
height of the table behind it and pushes the dialog out of frame. `1×` pixel
density throughout, no device frames, no annotations.
