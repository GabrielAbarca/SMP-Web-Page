import { getSession, signOut } from './auth.js';
import { supabase } from './supabaseClient.js';
import {
  fetchStudentProfile,
  fetchGradingPeriods,
  fetchStudentGrades,
  fetchStudentAttendance,
  fetchClassSchedule,
  fetchTeachers,
  fetchEvents,
  fetchDashboardStats,
} from './supabaseQueries.js';




const session = await getSession();
if (!session) {
  window.location.replace('/login.html');
  throw new Error('Unauthenticated');
}
const user = session?.user;

if (!user) {
  window.location.replace('/login.html');
  throw new Error('Unauthenticated'); 
}




const { data: studentRow, error: studentError } = await supabase
  .from('students')
  .select('id')
  .eq('auth_user_id', user.id)
  .single();

let STUDENT_ID;

if (studentRow?.id) {
  STUDENT_ID = studentRow.id;
} else {
  if (import.meta.env.DEV) {
    console.warn(
      '[SMP] No student found for auth user id', user.id,
      '— falling back to STUDENT_ID=1 (dev only).'
    );
    STUDENT_ID = 1;
  } else {
    
    console.error('[SMP] No student profile linked to this account.', studentError?.message);
    await signOut();
    window.location.replace('/login.html');
    throw new Error('No student profile linked.');
  }
}


supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    window.location.replace('/login.html');
  }
});


window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});




const sideMenu = document.querySelector('aside');
const menuBtn = document.querySelector('#menu-btn');
const closeBtn = document.querySelector('#close-btn');
const themeToggler = document.querySelector('.theme-toggler');

menuBtn.addEventListener('click', () => { sideMenu.style.display = 'block'; });
closeBtn.addEventListener('click', () => { sideMenu.style.display = 'none'; });

themeToggler.addEventListener('click', () => {
  document.body.classList.toggle('dark-theme-variables');
  themeToggler.querySelector('span:nth-child(1)').classList.toggle('active');
  themeToggler.querySelector('span:nth-child(2)').classList.toggle('active');
});




const sidebarLinks = document.querySelectorAll('aside .sidebar a[data-page]');
const viewSections = document.querySelectorAll('.view-section');
const viewCache = {};   

function navigateTo(page) {
  
  sidebarLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  
  viewSections.forEach(section => {
    section.classList.toggle('active', section.id === `view-${page}`);
  });

  
  if (!viewCache[page]) {
    viewCache[page] = true;
    initView(page);
  }

  
  if (window.innerWidth <= 768) {
    sideMenu.style.display = 'none';
  }
}

sidebarLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});


const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut();
    window.location.replace('/login.html');
  });
}




async function initView(page) {
  switch (page) {
    case 'dashboard': return initDashboard();
    case 'grades': return initGrades();
    case 'schedule': return initSchedule();
    case 'teachers': return initTeachersView();
    case 'attendance': return initAttendanceView();
    case 'events': return initEventsView();
    default: break;
  }
}


let studentProfile = null;
let schoolYearId = null;
let classId = null;




async function initDashboard() {
  
  studentProfile = await fetchStudentProfile(STUDENT_ID);
  if (!studentProfile) {
    document.getElementById('student-name').textContent = 'Error loading profile';
    return;
  }

  const cls = studentProfile.classes;
  schoolYearId = cls?.school_years?.id;
  classId = cls?.id;

  
  document.getElementById('student-name').textContent =
    `${studentProfile.first_name} ${studentProfile.last_name}`;
  document.getElementById('student-class').textContent =
    `${cls?.grade_levels?.name ?? '—'} — Section ${cls?.display_name ?? '—'}`;
  document.getElementById('student-year').textContent =
    cls?.school_years?.name ?? '—';
  document.getElementById('student-status').textContent =
    capitalize(studentProfile.status);

  
  document.getElementById('welcome-name').textContent =
    studentProfile.first_name;

  
  const stats = await fetchDashboardStats(STUDENT_ID, classId);

  
  document.getElementById('attendance-fraction').textContent =
    `${stats.attendance.present}/${stats.attendance.total}`;
  document.getElementById('attendance-pct').textContent =
    `${stats.attendance.percentage}%`;
  setCircleProgress('circle-attendance', stats.attendance.percentage);

  
  document.getElementById('grade-avg').textContent = stats.grades.average;
  document.getElementById('grade-pct').textContent = `${Math.round(stats.grades.average)}%`;
  setCircleProgress('circle-grade', stats.grades.average);

  
  if (stats.nextClass) {
    document.getElementById('next-class-subject').textContent =
      stats.nextClass.subjects?.name ?? '—';
    document.getElementById('next-class-teacher').textContent =
      `${stats.nextClass.teachers?.first_name ?? ''} ${stats.nextClass.teachers?.last_name ?? ''}`;
    document.getElementById('next-class-time').textContent =
      `${formatTime(stats.nextClass.start_time)} – ${formatTime(stats.nextClass.end_time)}`;
    document.getElementById('next-class-room').textContent =
      stats.nextClass.rooms?.name ?? '—';
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    document.getElementById('next-class-day').textContent =
      dayNames[stats.nextClass.day_of_week] ?? '';
  } else {
    document.getElementById('next-class-subject').textContent = 'No upcoming';
    document.getElementById('next-class-day').textContent = 'Enjoy your break!';
  }

  
  renderDashboardGradeTable(stats.allGrades);

  
  await renderUpcomingEvents();

  
  renderSubjectAnalytics(stats.allGrades);
}


function renderDashboardGradeTable(grades) {
  const tbody = document.getElementById('dashboard-grades-body');

  if (!grades || grades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No grades recorded yet.</td></tr>';
    return;
  }

  
  const bySubject = {};
  grades.forEach(g => {
    const subj = g.class_subject_teachers?.subjects;
    const key = subj?.id ?? 'unknown';
    if (!bySubject[key]) {
      bySubject[key] = { name: subj?.name ?? '—', code: subj?.code ?? '', color: subj?.color ?? '#7380ec', periods: {} };
    }
    const periodOrder = g.grading_periods?.period_order;
    if (periodOrder) {
      bySubject[key].periods[periodOrder] = Number(g.score);
    }
  });

  tbody.innerHTML = Object.values(bySubject).map(subj => {
    const p1 = subj.periods[1];
    const p2 = subj.periods[2];
    const p3 = subj.periods[3];
    const scores = [p1, p2, p3].filter(s => s !== undefined);
    const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

    return `<tr>
      <td style="text-align:left;">
        <span class="subject-dot" style="background:${subj.color}"></span>${subj.name}
      </td>
      <td>${p1 !== undefined ? scoreHtml(p1) : '—'}</td>
      <td>${p2 !== undefined ? scoreHtml(p2) : '—'}</td>
      <td>${p3 !== undefined ? scoreHtml(p3) : '—'}</td>
      <td>${avg !== null ? scoreHtml(avg) : '—'}</td>
    </tr>`;
  }).join('');
}




async function initGrades() {
  if (!schoolYearId) {
    const profile = await fetchStudentProfile(STUDENT_ID);
    schoolYearId = profile?.classes?.school_years?.id;
  }

  
  const periods = await fetchGradingPeriods(schoolYearId);
  const select = document.getElementById('period-select');
  periods.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });

  
  await loadGradesTable();

  
  select.addEventListener('change', () => loadGradesTable());
}

async function loadGradesTable() {
  const select = document.getElementById('period-select');
  const periodId = select.value === 'all' ? null : Number(select.value);

  const grades = await fetchStudentGrades(STUDENT_ID, periodId);
  const tbody = document.getElementById('grades-body');
  const tfoot = document.getElementById('grades-footer');

  if (!grades || grades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No grades for this period.</td></tr>';
    tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = grades.map(g => {
    const subj = g.class_subject_teachers?.subjects;
    const teacher = g.class_subject_teachers?.teachers;
    const score = Number(g.score);
    const pass = score >= 50;

    return `<tr>
      <td style="text-align:left;">
        <span class="subject-dot" style="background:${subj?.color ?? '#7380ec'}"></span>${subj?.name ?? '—'}
      </td>
      <td>${subj?.code ?? '—'}</td>
      <td>${teacher ? `${teacher.first_name} ${teacher.last_name}` : '—'}</td>
      <td>${scoreHtml(score)}</td>
      <td><span class="status-badge ${pass ? 'status-pass' : 'status-fail'}">${pass ? 'Pass' : 'Fail'}</span></td>
      <td>${g.grading_periods?.name ?? '—'}</td>
    </tr>`;
  }).join('');

  
  const scores = grades.filter(g => g.score !== null).map(g => Number(g.score));
  const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : '—';
  tfoot.innerHTML = `<tr>
    <td colspan="3" style="text-align:right; font-weight:700;">Period Average</td>
    <td>${typeof avg === 'number' ? scoreHtml(avg) : avg}</td>
    <td colspan="2"></td>
  </tr>`;
}




async function initSchedule() {
  if (!classId) {
    const profile = await fetchStudentProfile(STUDENT_ID);
    classId = profile?.classes?.id;
  }

  const schedule = await fetchClassSchedule(classId);
  const grid = document.getElementById('schedule-grid');

  if (!schedule || schedule.length === 0) {
    grid.innerHTML = '<div class="loading-cell">No schedule data available.</div>';
    return;
  }

  
  const timeSlots = [...new Map(
    schedule.map(s => [`${s.start_time}-${s.end_time}`, { start: s.start_time, end: s.end_time }])
  ).values()].sort((a, b) => a.start.localeCompare(b.start));

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  
  let html = '';

  
  html += '<div class="sch-header">Time</div>';
  dayNames.forEach(d => { html += `<div class="sch-header">${d}</div>`; });

  
  timeSlots.forEach(slot => {
    html += `<div class="sch-time">${formatTime(slot.start)}<br>${formatTime(slot.end)}</div>`;

    for (let day = 1; day <= 5; day++) {
      const entry = schedule.find(s =>
        s.day_of_week === day && s.start_time === slot.start && s.end_time === slot.end
      );

      if (entry) {
        const color = entry.subjects?.color ?? '#7380ec';
        html += `<div class="sch-cell">
          <div class="sch-color-bar" style="background:${color}"></div>
          <span class="sch-subject">${entry.subjects?.name ?? '—'}</span>
          <span class="sch-teacher">${entry.teachers?.first_name ?? ''} ${entry.teachers?.last_name ?? ''}</span>
          <span class="sch-room">${entry.rooms?.name ?? ''}</span>
        </div>`;
      } else {
        html += '<div class="sch-cell empty">—</div>';
      }
    }
  });

  grid.innerHTML = html;
}




async function initTeachersView() {
  const teachers = await fetchTeachers();
  const container = document.getElementById('teacher-cards');

  if (!teachers || teachers.length === 0) {
    container.innerHTML = '<div class="loading-cell">No teachers found.</div>';
    return;
  }

  container.innerHTML = teachers.map(t => {
    const statusClass = t.status === 'active' ? 'badge-success' :
      t.status === 'on_leave' ? 'badge-warning' : 'badge-danger';
    return `<div class="teacher-card">
      <div class="teacher-avatar">
        <span class="material-symbols-outlined">person</span>
      </div>
      <h3>${t.first_name} ${t.last_name}</h3>
      <p class="teacher-spec">${t.specialization ?? '—'}</p>
      <p class="teacher-email">${t.email ?? '—'}</p>
      <div class="teacher-status">
        <span class="badge ${statusClass}">${capitalize(t.status)}</span>
      </div>
    </div>`;
  }).join('');
}




async function initAttendanceView() {
  const records = await fetchStudentAttendance(STUDENT_ID);

  
  const summary = document.getElementById('attendance-summary');
  const total = records.length;
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  records.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  summary.innerHTML = [
    { label: 'Present', val: counts.present, cls: 'stat-present' },
    { label: 'Absent', val: counts.absent, cls: 'stat-absent' },
    { label: 'Late', val: counts.late, cls: 'stat-late' },
    { label: 'Excused', val: counts.excused, cls: 'stat-excused' },
  ].map(s => `
    <div class="att-stat ${s.cls}">
      <h2>${s.val}</h2>
      <p>${s.label}</p>
    </div>
  `).join('');

  
  const tbody = document.getElementById('attendance-body');

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No attendance records.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const statusCls = `status-${r.status}`;
    const teacher = r.teachers;
    return `<tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.classes?.display_name ?? '—'}</td>
      <td><span class="status-badge ${statusCls}">${capitalize(r.status)}</span></td>
      <td>${teacher ? `${teacher.first_name} ${teacher.last_name}` : '—'}</td>
      <td>${r.notes ?? '—'}</td>
    </tr>`;
  }).join('');
}




async function initEventsView() {
  const events = await fetchEvents();
  const container = document.getElementById('events-timeline');

  if (!events || events.length === 0) {
    container.innerHTML = '<div class="loading-cell">No events found.</div>';
    return;
  }

  const iconMap = {
    holiday: 'beach_access',
    exam_period: 'quiz',
    activity: 'celebration',
    parent_meeting: 'groups',
    suspension: 'block',
    general: 'event',
  };

  container.innerHTML = events.map(ev => {
    const icon = iconMap[ev.type] ?? 'event';
    const dateStr = ev.end_date
      ? `${formatDate(ev.start_date)} → ${formatDate(ev.end_date)}`
      : formatDate(ev.start_date);

    return `<div class="event-card event-${ev.type}">
      <div class="event-icon">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <div class="event-body">
        <h3>${ev.title}</h3>
        <p>${ev.description ?? ''}</p>
        <div class="event-dates">
          <span class="material-symbols-outlined" style="font-size:.85rem;vertical-align:middle;">calendar_today</span>
          ${dateStr}
          <span class="badge badge-${eventTypeBadge(ev.type)}" style="margin-left:.5rem;">${formatEventType(ev.type)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}


async function renderUpcomingEvents() {
  const events = await fetchEvents();
  const card = document.getElementById('upcoming-events-card');

  
  const upcoming = events.slice(0, 4);

  if (upcoming.length === 0) {
    card.innerHTML = `<div class="update">
      <div class="profile-photo"><span class="material-symbols-outlined">event_busy</span></div>
      <div class="message"><p>No upcoming events.</p></div>
    </div>`;
    return;
  }

  card.innerHTML = upcoming.map(ev => `
    <div class="update">
      <div class="profile-photo">
        <span class="material-symbols-outlined">event</span>
      </div>
      <div class="message">
        <p><b>${ev.title}</b></p>
        <small class="text-muted">${formatDate(ev.start_date)}${ev.end_date ? ' → ' + formatDate(ev.end_date) : ''}</small>
      </div>
    </div>
  `).join('');
}


function renderSubjectAnalytics(grades) {
  const container = document.getElementById('subject-analytics-list');

  if (!grades || grades.length === 0) {
    container.innerHTML = '<p class="text-muted" style="padding:1rem;">No data yet.</p>';
    return;
  }

  
  const bySubject = {};
  grades.forEach(g => {
    const subj = g.class_subject_teachers?.subjects;
    const key = subj?.id ?? 'unknown';
    if (!bySubject[key]) {
      bySubject[key] = { name: subj?.name ?? '—', color: subj?.color ?? '#7380ec', scores: [] };
    }
    if (g.score !== null) bySubject[key].scores.push(Number(g.score));
  });

  const subjectIcons = {
    'Matemáticas': 'calculate',
    'Español': 'menu_book',
    'Historia': 'history_edu',
    'Ciencias Naturales': 'biotech',
    'Inglés': 'translate',
    'Física': 'science',
    'Educación Física': 'fitness_center',
    'Arte': 'palette',
    'Geografía': 'public',
    'Química': 'science',
  };

  container.innerHTML = Object.values(bySubject).map(subj => {
    const avg = subj.scores.length > 0
      ? Math.round((subj.scores.reduce((a, b) => a + b, 0) / subj.scores.length) * 10) / 10
      : 0;
    const icon = subjectIcons[subj.name] ?? 'book';
    const fillColor = avg >= 70 ? 'var(--color-success)' : avg >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';

    return `<div class="item">
      <div class="icon" style="background:${subj.color}">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <div class="right-content">
        <div class="info">
          <h3>${subj.name}</h3>
          <div class="grade-bar">
            <div class="grade-fill" style="width:${avg}%; background:${fillColor}"></div>
          </div>
        </div>
        <span class="score-display ${avg >= 70 ? 'score-high' : avg >= 50 ? 'score-mid' : 'score-low'}">${avg}</span>
      </div>
    </div>`;
  }).join('');
}






function setCircleProgress(circleId, pct) {
  const circle = document.getElementById(circleId);
  if (!circle) return;
  const circumference = 2 * Math.PI * 37; 
  const offset = circumference - (pct / 100) * circumference;
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${offset}`;
}


function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}


function formatDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}


function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}


function scoreHtml(score) {
  const cls = score >= 70 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low';
  return `<span class="${cls}">${score}</span>`;
}


function eventTypeBadge(type) {
  const map = {
    holiday: 'danger',
    exam_period: 'warning',
    activity: 'success',
    parent_meeting: 'primary',
    suspension: 'danger',
    general: 'info',
  };
  return map[type] ?? 'info';
}


function formatEventType(type) {
  const map = {
    holiday: 'Holiday',
    exam_period: 'Exams',
    activity: 'Activity',
    parent_meeting: 'Parent Meeting',
    suspension: 'Suspension',
    general: 'General',
  };
  return map[type] ?? type;
}




async function init() {
  navigateTo('dashboard');
}

init();
