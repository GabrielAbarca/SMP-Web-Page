<div align="center">
  img
  <h1>SMP Dashboard</h1>
  <p><strong>A full-featured school management dashboard for Latin American institutions —<br/>built on a 18-table PostgreSQL schema with real-time data via Supabase.</strong></p>

  <br/>

  <a href="https://smp-web-page-hylqkoh2o-gabrielabarcas-projects.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-Open%20App-7c3aed?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo"/>
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/Status-In%20Progress-f59e0b?style=for-the-badge" alt="Status"/>
  &nbsp;
  <img src="https://img.shields.io/badge/Database-PostgreSQL%2016-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  &nbsp;
  <img src="https://img.shields.io/badge/Backend-Supabase-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
</div>

---

## 📸 Preview

img
---

## 🧩 What is SMP?

SMP Dashboard is a web-based school management platform designed around the operational structure of Latin American high schools. It gives administrators and staff a centralized view of everything happening across an institution. From class schedules and teacher assignments to student grades, attendance records, and upcoming events.

The project targets real data complexity: the underlying PostgreSQL schema spans **18 tables** to model academic periods, course sections and enrollment. All served in real time through Supabase.

---

## ✨ Features

| Module | Description |
|---|---|
| 📊 **Grades & Attendance** | Track student academic performance and daily attendance |
| 📅 **Schedules** | View weekly class schedules per course and teacher |
| 👨‍🏫 **Teacher Assignments** | View teachers assigned to the student |
| 🏫 **Class Information** | Detailed view of each class — enrolled year, class number, status |
| 📆 **Upcoming Events** | Institution events board for academic and administrative activities |
| 📈 **Reports & Analytics** | Data views for attendance rates and grade distributions |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript · HTML5 · CSS3 |
| **Build Tool** | Vite |
| **Database** | PostgreSQL 18 (hosted on Supabase) |
| **Backend / Auth** | Supabase (RLS policies · Auth · Realtime) |
| **Deployment** | Vercel |

---

## 🗄️ Database Architecture

The schema is designed around the structure of a Latin American school system, separating concerns across academic, administrative, and scheduling domains.

Img

> 💡 **Design decision:** Row Level Security (RLS) policies are enforced at the database level — not just the application layer — so each role (admin, teacher, student) can only read and write the rows they own, regardless of how the frontend queries Supabase.

---

## ⚙️ Local Setup

### Prerequisites

- Node.js 22+
- A [Supabase](https://supabase.com) project with the schema applied

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/GabrielAbarca/SMP-Web-Page.git
cd SMP-Web-Page

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Fill in your Supabase URL and anon key

# 4. Start the dev server
npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 🧱 Challenges Solved

- **RLS policy conflicts** — early schema versions had overlapping policies causing silent read failures; resolved by auditing policy targets per role and table combination
- **IPv6 connection errors on Vercel** — Supabase's direct connection doesn't support IPv6; fixed by switching to the Session Mode pooler URL
- **18-table relational schema** — modeling Latin American school structures (multi-period, multi-section, multi-role) without redundant data required several rounds of table-structuring before the schema stabilized.

---

## 🗺️ Roadmap

- [ ] Role-based login (admin · teacher · student views)
- [ ] PDF report export
- [ ] Mobile-responsive layout
- [ ] Notification system for events and grade updates

---

## 👤 Author

**Gabriel Zelaya** · [gzelaya.com](https://gzelaya.com) · [GitHub @GabrielAbarca](https://github.com/GabrielAbarca)

---

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0c29,50:302b63,100:24243e&height=100&section=footer" width="100%"/>
</div>
