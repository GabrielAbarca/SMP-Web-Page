// Fixture sets used only by the design-review capture run.
//
// They extend the shared e2e fixtures (e2e/fixtures.js) with enough rows to
// make each screen look like a real school rather than a stub: the console
// specs only need the shell, but a design critique needs populated stat
// cards, a full roster table and a gradebook with marks in it.
//
// Nothing here is imported by the test suite — the capture run has its own
// config (playwright.capture.config.js), so CI is untouched.

import { UID, teacherFix } from "../fixtures.js";

/** The date the overview treats as "today" (see admin.js todayIso). */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `days` before today, as YYYY-MM-DD. */
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const gradeLevels = [
  { id: 1, name: "7th Grade", numeric_level: 7 },
  { id: 2, name: "8th Grade", numeric_level: 8 },
  { id: 3, name: "9th Grade", numeric_level: 9 },
];

const rooms = [
  { id: 41, name: "Room 101", capacity: 30 },
  { id: 42, name: "Room 102", capacity: 30 },
  { id: 43, name: "Room 201", capacity: 28 },
  { id: 44, name: "Science Lab", capacity: 24 },
  { id: 45, name: "Auditorium", capacity: 120 },
];

const sections = [
  {
    id: 21,
    school_year_id: 1,
    grade_level_id: 1,
    section: "A",
    display_name: "7A",
    room_id: 41,
    max_capacity: 30,
    homeroom_teacher_id: 7,
  },
  {
    id: 22,
    school_year_id: 1,
    grade_level_id: 1,
    section: "B",
    display_name: "7B",
    room_id: 42,
    max_capacity: 30,
    homeroom_teacher_id: 8,
  },
  {
    id: 23,
    school_year_id: 1,
    grade_level_id: 2,
    section: "A",
    display_name: "8A",
    room_id: 43,
    max_capacity: 28,
    homeroom_teacher_id: 9,
  },
  {
    id: 24,
    school_year_id: 1,
    grade_level_id: 3,
    section: "A",
    display_name: "9A",
    room_id: null,
    max_capacity: 28,
    homeroom_teacher_id: 10,
  },
];

const teachers = [
  {
    id: 7,
    first_name: "Sofía",
    last_name: "Ramírez",
    specialization: "Mathematics",
    national_id: "0801-1990-00121",
    email: "sofia.ramirez@example.com",
    phone: "555-0100",
    hire_date: "2020-02-01",
    status: "active",
  },
  {
    id: 8,
    first_name: "Marco",
    last_name: "López",
    specialization: "Language Arts",
    national_id: "0801-1988-00344",
    email: "marco.lopez@example.com",
    phone: "555-0101",
    hire_date: "2019-08-12",
    status: "active",
  },
  {
    id: 9,
    first_name: "Valeria",
    last_name: "Cordero",
    specialization: "Biology",
    national_id: "0801-1991-00512",
    email: "valeria.cordero@example.com",
    phone: "555-0102",
    hire_date: "2021-01-18",
    status: "active",
  },
  {
    id: 10,
    first_name: "Diego",
    last_name: "Fuentes",
    specialization: "History",
    national_id: "0801-1985-00877",
    email: "diego.fuentes@example.com",
    phone: "555-0103",
    hire_date: "2018-03-05",
    status: "active",
  },
  {
    id: 11,
    first_name: "Carmen",
    last_name: "Núñez",
    specialization: "Art",
    national_id: "0801-1993-00901",
    email: "carmen.nunez@example.com",
    phone: "555-0104",
    hire_date: "2022-07-01",
    status: "inactive",
  },
];

const subjects = [
  { id: 31, name: "Mathematics", code: "MATH7", color: "#7380ec" },
  { id: 32, name: "Language Arts", code: "LANG7", color: "#ff7782" },
  { id: 33, name: "Biology", code: "BIO7", color: "#41f1b6" },
  { id: 34, name: "History", code: "HIST7", color: "#ffbb55" },
  { id: 35, name: "Physical Education", code: "PE7", color: "#7d8da1" },
];

const STUDENT_NAMES = [
  ["Ana", "García", "F"],
  ["Luis", "Martínez", "M"],
  ["Camila", "Herrera", "F"],
  ["Mateo", "Rojas", "M"],
  ["Isabella", "Vargas", "F"],
  ["Sebastián", "Moreno", "M"],
  ["Valentina", "Castro", "F"],
  ["Diego", "Salazar", "M"],
  ["Lucía", "Peña", "F"],
  ["Emilio", "Navarro", "M"],
  ["Renata", "Ibarra", "F"],
  ["Joaquín", "Delgado", "M"],
  ["Antonella", "Quintero", "F"],
  ["Tomás", "Mendoza", "M"],
];

const students = STUDENT_NAMES.map(([first, last, gender], i) => ({
  id: 101 + i,
  // The first row is the portal's signed-in student, so index.html and the
  // console agree on who "Ana García" is.
  auth_user_id: i === 0 ? UID : null,
  class_id: sections[i % sections.length].id,
  first_name: first,
  last_name: last,
  gender,
  email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
  phone: `555-02${String(i).padStart(2, "0")}`,
  national_id: `0801-2013-0${String(1000 + i)}`,
  enrollment_number: `S-${101 + i}`,
  date_of_birth: `2013-0${(i % 9) + 1}-1${i % 9}`,
  enrollment_date: "2025-09-01",
  // Two students off the active roster, so the status badges show both states.
  status: i === 11 || i === 13 ? "inactive" : "active",
  classes: sections[i % sections.length],
}));

// Today's attendance: mostly present, a couple late and absent, so the rate
// card lands on a believable figure rather than 100%.
const todayAttendance = students
  .filter((s) => s.status === "active")
  .map((s, i) => ({
    id: 900 + i,
    student_id: s.id,
    class_id: s.class_id,
    date: todayIso(),
    status: i % 9 === 0 ? "absent" : i % 5 === 0 ? "late" : "present",
    recorded_by: 7,
  }));

// History: three students cross the 3-absence at-risk threshold.
const historicAttendance = [];
let attendanceId = 1000;
students.slice(0, 5).forEach((s, si) => {
  const absences = si < 3 ? 4 : 1;
  for (let d = 1; d <= absences; d += 1) {
    historicAttendance.push({
      id: attendanceId++,
      student_id: s.id,
      class_id: s.class_id,
      date: daysAgo(d),
      status: "absent",
      recorded_by: 7,
    });
  }
});

/** Admin console with a full school behind it. */
export const adminPopulatedFix = {
  profiles: [{ id: UID, name: "Gabriel", role: "admin" }],
  school_years: [
    {
      id: 1,
      name: "2025-2026",
      start_date: "2025-09-01",
      end_date: "2026-06-30",
      is_active: true,
    },
  ],
  school_settings: [
    { id: 1, name: "Colegio San Marcos", logo_url: null, id_label: null },
  ],
  grading_periods: teacherFix.grading_periods,
  grade_levels: gradeLevels,
  rooms,
  classes: sections,
  teachers,
  subjects,
  students,
  attendance: [...todayAttendance, ...historicAttendance],
  class_subject_teachers: teacherFix.class_subject_teachers,
  grade_level_subjects: [],
  schedules: [],
};

/**
 * A school on its first login: the admin's profile exists, and nothing else
 * has been created yet. Every other table resolves to [] in the route handler.
 */
export const adminEmptyFix = {
  profiles: [{ id: UID, name: "Gabriel", role: "admin" }],
};

const assignments = [
  {
    id: 401,
    class_subject_teacher_id: 11,
    grading_period_id: 1,
    category_id: 61,
    name: "Unit 1 Quiz",
    due_date: daysAgo(21),
    max_score: 20,
    note: null,
    created_at: "2026-06-05T09:00:00Z",
  },
  {
    id: 402,
    class_subject_teacher_id: 11,
    grading_period_id: 1,
    category_id: 62,
    name: "Fractions Worksheet",
    due_date: daysAgo(14),
    max_score: 10,
    note: null,
    created_at: "2026-06-12T09:00:00Z",
  },
  {
    id: 403,
    class_subject_teacher_id: 11,
    grading_period_id: 1,
    category_id: 61,
    name: "Midterm Exam",
    due_date: daysAgo(7),
    max_score: 100,
    note: "Covers units 1–3",
    created_at: "2026-06-19T09:00:00Z",
  },
  {
    id: 404,
    class_subject_teacher_id: 11,
    grading_period_id: 1,
    category_id: 63,
    name: "Geometry Project",
    due_date: daysAgo(2),
    max_score: 50,
    note: null,
    created_at: "2026-06-26T09:00:00Z",
  },
];

const gradebookStudents = students
  .filter((s) => s.class_id === 21)
  .map((s) => ({
    id: s.id,
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.email,
    phone: s.phone,
    status: s.status,
    enrollment_number: s.enrollment_number,
    national_id: s.national_id,
    date_of_birth: s.date_of_birth,
    gender: s.gender,
    address: null,
    photo_url: null,
    enrollment_date: s.enrollment_date,
  }));

// Spread across the grade bands so the colored grade cells are all visible.
const PERIOD_SCORES = [94, 88, 72, 61, 45, 83, 97];

const periodGrades = gradebookStudents.map((s, i) => ({
  student_id: s.id,
  class_subject_teacher_id: 11,
  grading_period_id: 1,
  period_score: PERIOD_SCORES[i % PERIOD_SCORES.length],
  graded_count: i % 4 === 0 ? 3 : 4,
  total_assignments: assignments.length,
}));

/** Teacher console with a class whose gradebook actually has marks in it. */
export const teacherPopulatedFix = {
  ...teacherFix,
  school_settings: adminPopulatedFix.school_settings,
  students: gradebookStudents.map((s) => ({ ...s, class_id: 21 })),
  rooms,
  subjects,
  assignments,
  grade_categories: [
    { id: 61, class_subject_teacher_id: 11, name: "Exams", weight: 50 },
    { id: 62, class_subject_teacher_id: 11, name: "Homework", weight: 20 },
    { id: 63, class_subject_teacher_id: 11, name: "Projects", weight: 30 },
  ],
  student_period_grades: periodGrades,
  attendance: todayAttendance.filter((a) => a.class_id === 21),
};
