# TTU Band & Orchestra Camp — Attendance & Management App
# HANDOFF DOCUMENT FOR CLAUDE CODE

## WHAT THIS IS

A complete web app for managing TTU Band and Orchestra Camp (TTUBOC). ~644 campers, ~88 faculty, 1-week summer camp. The app has two interfaces: a mobile-first teacher view for taking attendance every period, and a desktop admin dashboard for managing students, searching for missing campers, editing data, and importing spreadsheet data.

## CURRENT STATE

The app has been scaffolded with Next.js 14 + SQLite (better-sqlite3) + Tailwind CSS. All files are written but have NOT been tested or run yet. Data from the 2025 camp has been parsed into JSON files in /data/. The original Excel/Word source files are in /source-data/ for reference.

**Your job: get this app running, test it, fix any bugs, import the real data, and make it production-ready.**

---

## TECH STACK

- **Next.js 14** with App Router (NO static export — dynamic routes required)
- **SQLite** via better-sqlite3 (synchronous, fast, local file at ./data/camp.db)
- **Tailwind CSS** for styling
- **TypeScript**
- Runs locally with `npm run dev` — no external services needed

---

## THE CAMP STRUCTURE

### Ensembles (9 total)
- Band 1 (most advanced) through Band 7 (beginning)
- Orchestra 1 (advanced) and Orchestra 2
- Students are assigned to ONE ensemble after auditions on day 1
- Some band wind players may cross into orchestra

### Daily Schedule (10 periods)
| # | Name | Time |
|---|------|------|
| 1 | Period 1 | 8:00–8:50 |
| 2 | Period 2 | 9:00–9:50 |
| 3 | Period 3 | 10:00–10:50 |
| 4 | Period 4A | 11:00–11:50 |
| 5 | Period 4B | 12:00–12:50 |
| 6 | Period 5 | 1:00–1:50 |
| 7 | Period 6 | 2:00–2:50 |
| 8 | Assembly | 3:00–3:45 |
| 9 | Period 7 | 4:00–4:50 |
| 10 | Period 8 | 5:00–6:00 |

### Session Types
- **Rehearsal**: Full ensemble rehearsal (e.g., "Band 1 Rehearsal" in Hemmle)
- **Sectional**: Instrument-specific (e.g., "Trumpet Sectional B1/B2" in SOM 209)
- **Masterclass**: Advanced instruction by instrument group
- **Elective**: Student chooses on-site (Theory, Music History, Piano, etc.)
- **Assembly**: All campers in Red Raider Ballroom
- **Lunch**: Period 4B for most ensembles

### Instruments
Band: Flute, Oboe, Clarinet, Bass Clarinet, Bassoon, Alto Saxophone, Tenor Saxophone, Bari Saxophone, Trumpet, French Horn, Trombone, Bass Trombone, Euphonium, Tuba, Percussion
Orchestra: Violin, Viola, Cello, Double Bass
Special: Drum Major

### Student Assignment Logic
A student's schedule is determined by:
1. Their **ensemble** (Band 1, Orchestra 2, etc.) — determines rehearsal times
2. Their **instrument** — determines which sectional and masterclass they attend
3. Their **elective choices** — chosen on-site, not pre-assigned
4. Everyone attends **Assembly**

---

## DATABASE SCHEMA

### students
- id, first_name, last_name, preferred_name, gender
- division (Commuter Camper / Overnight Camper)
- instrument, ensemble (null until assigned after auditions), chair_number
- dorm_building, dorm_room
- email, cell_phone
- parent_first_name, parent_last_name, parent_phone
- medical_notes, additional_info (JSON text for extra fields)

### faculty
- id, first_name, last_name, role, email

### periods
- id, number (1-10), name, start_time, end_time

### sessions (a specific activity in a specific period)
- id, period_id, name, type (rehearsal/sectional/masterclass/elective/assembly/lunch)
- location, faculty_id, ensemble, instrument

### session_students (enrollment: which students attend which sessions)
- id, session_id, student_id (UNIQUE pair)

### attendance
- id, student_id, session_id, date (YYYY-MM-DD)
- status (present/absent/tardy)
- marked_at, marked_by (faculty_id)
- UNIQUE(student_id, session_id, date)

### schedule_templates (maps ensemble+instrument to sessions for bulk assignment)
- id, ensemble, instrument, session_id

---

## DATA FILES (in /data/)

All parsed from real 2025 camp Excel/Word files:

- **students.json** — 644 students with all contact/dorm info
- **faculty.json** — 87 faculty with roles and emails
- **periods.json** — 10 periods with times
- **sessions.json** — 91 sessions (rehearsals, sectionals, masterclasses, electives, etc.)
- **faculty_schedule.json** — 410 faculty-to-period-activity mappings

### Import order:
1. periods (seed these on DB init)
2. faculty
3. students
4. sessions (needs period_id references)
5. faculty_schedule (link faculty to sessions)
6. session_students (enrollments — after students get ensemble assignments)

### Note on ensemble assignments:
Students in students.json have `ensemble: null` because ensembles are assigned AFTER auditions on day 1. The admin will need to:
1. Import students
2. Conduct auditions
3. Assign each student to an ensemble (could be bulk via CSV upload or manual)
4. Then auto-assign students to sessions based on their ensemble + instrument

---

## APP PAGES

### Teacher Interface (no auth, shared link)

**/ (Landing Page)**
- Searchable list of all faculty names
- Tap your name → go to your dashboard
- Small "Admin" link at bottom

**/teacher/[id] (Teacher Dashboard)**
- Shows today's date
- Lists all sessions this teacher is assigned to
- Current period highlighted based on real time
- Each session card shows: name, time, location, attendance progress (e.g., "14/18 marked")
- Tap a session → attendance page

**/teacher/[id]/session/[sessionId] (Attendance Page)**
- THIS IS THE MOST IMPORTANT PAGE — teachers use it 5-10 times daily on their phones
- Must be FAST, BIG tap targets, dead simple
- Sticky header with class info and live counts
- Student list alphabetically sorted
- Each row: student name, instrument, dorm room, status button
- Tap status button to toggle: Unmarked → Present → Absent
- If student was Absent and gets marked Present after class start time → auto-Tardy
- "Mark All Remaining as Absent" button at bottom
- Real-time count bar: ✓ Present | ✗ Absent | ⏱ Tardy | — Unmarked

### Admin Interface (password: "camp2026" or ADMIN_PASSWORD env var)

**/admin (Login Page)**
- Simple password input

**/admin/dashboard (Main Dashboard)**
- THE ADMIN'S COMMAND CENTER
- Date picker (defaults to today)
- Top stats: total students, present, absent, tardy, unmarked across all periods
- POWERFUL FILTER BAR: search student name, filter by ensemble, period, instrument, dorm building, status
- Absence/tardy table: student name (clickable), status, session, teacher, period, ensemble, dorm, parent phone
- Click student name → STUDENT DETAIL MODAL
- "Export CSV" button for filtered view
- This needs to be FAST — the admin is desperately looking for a missing kid

**/admin/dashboard → Student Detail Modal**
- Full profile: name, preferred name, instrument, ensemble, chair, gender
- Contact: email, cell, parent name, parent phone
- Housing: division, building, room number
- Medical notes (yellow highlight if present)
- Additional info (any extra imported fields)
- TODAY'S FULL SCHEDULE with attendance status per period (green/red/orange/gray)
- Inline edit on any field — click to edit, save immediately

**/admin/data/students (Student Table)**
- Spreadsheet-like view of ALL students
- Sortable columns, search, filter
- Inline editing: click any cell to edit
- Add new student, delete student (with confirmation)
- Bulk assign ensembles

**/admin/data/faculty (Faculty Table)**
- Same spreadsheet-style as students

**/admin/data/sessions (Sessions Table)**
- All sessions with period, type, location, ensemble, instructor

**/admin/import (Data Import)**
- Upload CSV/Excel files
- Preview parsed data before importing
- Map columns to database fields
- Support for students, faculty, sessions, enrollments

**/admin/schedule (Schedule Grid)**
- Visual grid: periods as columns, ensembles as rows
- Each cell shows what that ensemble does that period
- Click to see/edit session details

---

## API ROUTES

All under /app/api/:
- students/ — CRUD + /[id]/schedule
- faculty/ — CRUD + /[id]/sessions
- sessions/ — CRUD + /[id]/students
- attendance/ — upsert + /report (filtered absence report)
- import/ — bulk import for students, faculty, sessions, enrollments
- schedule/ — full schedule grid
- stats/ — daily aggregate stats
- admin/login — password check

---

## CRITICAL UX REQUIREMENTS

1. **Teacher attendance page must work flawlessly on phones** — big buttons, fast loads, no fiddly interactions
2. **Admin search must be INSTANT** — the admin is panicking trying to find a missing kid, needs to search by name and immediately see dorm room, schedule, parent phone
3. **Cross-referencing is key** — admin clicks a student and sees EVERYTHING: where they should be right now, where they've been today, their dorm, their parents
4. **Editable on the fly** — admin needs to change a student's ensemble, room, or any field without going through an import process
5. **The "Mark All Remaining as Absent" button is essential** — teachers mark present students then hit this to mark everyone else absent in one tap

---

## WHAT NEEDS TO HAPPEN NEXT

1. **Run `npm install` and `npm run dev`** — fix any build/runtime errors
2. **Write a data import script** (or use the /admin/import page) to load the JSON files into SQLite
3. **Test the teacher flow**: pick a teacher → see sessions → take attendance
4. **Test the admin flow**: login → search for a student → see their full profile and schedule
5. **Test edge cases**: what happens with no data? Partially marked attendance? Searching for a student who's absent from multiple periods?
6. **Add a data seed script** (e.g., `npm run seed`) that loads all JSON files into the database
7. **Polish**: loading states, error handling, empty states, responsive layout

---

## SOURCE DATA FILES (in /source-data/)

These are the original files David uploaded. Reference them if you need to re-parse anything:
- Camper Master List-2.xlsx (644 students with contact info)
- 2025 Faculty Schedule.xlsx (88 faculty with period assignments)
- 2025 BOC Schedule.xlsx (room-based master schedule)
- Roster v2-TTU Band and Orchestra Camp.xlsx (housing/dorm assignments)
- Band 1-7 Schedule.docx (ensemble daily schedules)
- ORCHESTRA 1-2 Schedule.docx (orchestra daily schedules)

---

## DEPLOYMENT

For now this runs locally. When ready to deploy, the plan is Firebase Hosting (project ID: ttuboc-attendance). But get it working locally first — deployment is a separate step.

David's GitHub: https://github.com/dbiel/camp-attendance
David's email: david@bieldentalcabinets.com

---

## ADMIN PASSWORD

Default: `camp2026` (or set ADMIN_PASSWORD environment variable)
