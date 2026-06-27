import { supabase } from "./supabaseClient.js";

export async function fetchStudentProfile(studentId) {
  const { data, error } = await supabase
    .from("students")
    .select(
      `
      *,
      classes!class_id (
        id, section, display_name, max_capacity, homeroom_teacher_id, room_id,
        grade_levels ( id, name, numeric_level ),
        school_years ( id, name, start_date, end_date, is_active )
      )
    `,
    )
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    console.error("fetchStudentProfile:", error.message);
    return null;
  }
  if (!data) {
    console.error("fetchStudentProfile: no student found with id", studentId);
    return null;
  }

  const cls = data.classes;
  if (cls && cls.homeroom_teacher_id) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, first_name, last_name")
      .eq("id", cls.homeroom_teacher_id)
      .maybeSingle();
    cls.homeroom_teacher = teacher;
  }

  if (cls && cls.room_id) {
    const { data: room } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("id", cls.room_id)
      .maybeSingle();
    cls.room = room;
  }

  return data;
}

export async function fetchGradingPeriods(schoolYearId) {
  const { data, error } = await supabase
    .from("grading_periods")
    .select("*")
    .eq("school_year_id", schoolYearId)
    .order("period_order", { ascending: true });

  if (error) {
    console.error("fetchGradingPeriods:", error.message);
    return [];
  }
  return data;
}

export async function fetchStudentGrades(studentId, gradingPeriodId = null) {
  let query = supabase
    .from("student_grades")
    .select(
      `
      id, score, notes, submitted_at,
      grading_periods ( id, name, period_order ),
      class_subject_teachers (
        id,
        subjects ( id, name, code, color ),
        teachers ( id, first_name, last_name )
      )
    `,
    )
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: true });

  if (gradingPeriodId) {
    query = query.eq("grading_period_id", gradingPeriodId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchStudentGrades:", error.message);
    return [];
  }
  return data;
}

export async function fetchStudentAttendance(studentId) {
  const { data, error } = await supabase
    .from("attendance")
    .select(
      `
      id, date, status, notes, recorded_by,
      classes ( id, display_name )
    `,
    )
    .eq("student_id", studentId)
    .order("date", { ascending: false });

  if (error) {
    console.error("fetchStudentAttendance:", error.message);
    return [];
  }

  for (const record of data) {
    if (record.recorded_by) {
      const { data: teacher } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .eq("id", record.recorded_by)
        .maybeSingle();
      record.teacher = teacher;
    }
  }

  return data;
}

export async function fetchClassSchedule(classId) {
  const { data, error } = await supabase
    .from("schedules")
    .select(
      `
      id, day_of_week, start_time, end_time,
      subjects ( id, name, code, color ),
      teachers ( id, first_name, last_name ),
      rooms ( id, name )
    `,
    )
    .eq("class_id", classId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("fetchClassSchedule:", error.message);
    return [];
  }
  return data;
}

export async function fetchTeachers() {
  const { data, error } = await supabase
    .from("teachers")
    .select("*")
    .order("last_name", { ascending: true });

  if (error) {
    console.error("fetchTeachers:", error.message);
    return [];
  }
  return data;
}

export async function fetchEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    console.error("fetchEvents:", error.message);
    return [];
  }
  return data;
}

export async function fetchDashboardStats(studentId, classId) {
  const attendance = await fetchStudentAttendance(studentId);
  const totalDays = attendance.length;
  const presentDays = attendance.filter(
    (a) => a.status === "present" || a.status === "late",
  ).length;
  const attendancePct =
    totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const grades = await fetchStudentGrades(studentId);
  const scores = grades
    .filter((g) => g.score !== null)
    .map((g) => Number(g.score));
  const gradeAvg =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
        10
      : 0;

  const schedule = await fetchClassSchedule(classId);
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let nextClass = null;

  for (let offset = 0; offset < 7; offset++) {
    const checkDay = ((currentDay + offset - 1) % 5) + 1;
    const daySchedule = schedule.filter((s) => s.day_of_week === checkDay);
    if (offset === 0) {
      const upcoming = daySchedule.filter((s) => s.start_time > currentTime);
      if (upcoming.length > 0) {
        nextClass = upcoming[0];
        break;
      }
    } else {
      if (daySchedule.length > 0) {
        nextClass = daySchedule[0];
        break;
      }
    }
  }

  return {
    attendance: {
      present: presentDays,
      total: totalDays,
      percentage: attendancePct,
    },
    grades: { average: gradeAvg, count: scores.length },
    nextClass,
    allGrades: grades,
    allAttendance: attendance,
    allSchedule: schedule,
  };
}

export async function fetchDisciplineRecords(studentId) {
  const { data, error } = await supabase
    .from("discipline_records")
    .select(
      `
      *,
      teachers:reported_by_teacher ( id, first_name, last_name )
    `,
    )
    .eq("student_id", studentId)
    .order("date", { ascending: false });

  if (error) {
    console.error("fetchDisciplineRecords:", error.message);
    return [];
  }
  return data;
}
