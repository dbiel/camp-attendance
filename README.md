# TTU Band & Orchestra Camp - Management System

A complete web app for managing attendance and scheduling at TTU Band and Orchestra Camp. Runs locally using Next.js and SQLite — no external services required.

## Features

- **Teacher Interface**: Quick, phone-friendly attendance taking
- **Admin Dashboard**: Comprehensive reporting and data management
- **Local Database**: SQLite-based, file-stored, self-contained
- **Real-time Stats**: Daily attendance summaries
- **Data Import**: Bulk import students, faculty, sessions, and enrollments
- **Mobile-First Design**: Optimized for teachers taking attendance on phones

## Tech Stack

- **Frontend**: React 18, Next.js 14 (App Router)
- **Database**: SQLite via better-sqlite3
- **Styling**: Tailwind CSS
- **Environment**: Node.js

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Admin Password

Edit `.env.local`:

```
ADMIN_PASSWORD=camp2026
```

Change `camp2026` to your desired admin password.

### 3. Run Development Server

```bash
npm run dev
```

The app will start at `http://localhost:3000`

### 4. Initial Setup

1. Visit `http://localhost:3000` to see the teacher landing page
2. Go to `http://localhost:3000/admin` to access the admin portal
3. Enter your admin password (default: `camp2026`)
4. Use the Import Data page to load your student, faculty, and session data

## Database

- **Location**: `./data/camp.db`
- **Type**: SQLite (WAL mode for better concurrency)
- **Auto-initialized**: Tables are created automatically on first run
- **Seeded data**: Periods are seeded on first run

## Project Structure

```
camp-app/
├── app/
│   ├── api/                 # API routes
│   │   ├── students/
│   │   ├── faculty/
│   │   ├── sessions/
│   │   ├── attendance/
│   │   ├── import/
│   │   ├── schedule/
│   │   ├── stats/
│   │   └── admin/
│   ├── teacher/             # Teacher pages
│   ├── admin/               # Admin pages
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── db.ts                # Database functions
│   └── types.ts             # TypeScript interfaces
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

## API Endpoints

### Students
- `GET /api/students` - List all students
- `POST /api/students` - Create student
- `GET /api/students/[id]` - Get student
- `PUT /api/students/[id]` - Update student
- `DELETE /api/students/[id]` - Delete student
- `GET /api/students/[id]/schedule` - Get student's schedule

### Faculty
- `GET /api/faculty` - List all faculty
- `POST /api/faculty` - Create faculty
- `GET /api/faculty/[id]/sessions` - Get faculty's sessions

### Sessions
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/[id]/students` - Get students in session

### Attendance
- `GET /api/attendance?session_id=&date=` - Get session attendance
- `POST /api/attendance` - Mark attendance
- `GET /api/attendance/report?date=` - Get absence/tardy report

### Import
- `POST /api/import/students` - Bulk import students
- `POST /api/import/faculty` - Bulk import faculty
- `POST /api/import/sessions` - Bulk import sessions
- `POST /api/import/enrollments` - Bulk assign students to sessions

### Other
- `GET /api/schedule` - Get full schedule grid
- `GET /api/stats?date=` - Get daily statistics

## CSV Import Format

### Students
```csv
first_name,last_name,preferred_name,gender,division,instrument,ensemble,chair_number,dorm_building,dorm_room,email,cell_phone,parent_first_name,parent_last_name,parent_phone,medical_notes
John,Doe,Johnny,M,Overnight,Trumpet,Band 1,5,North,101,john@example.com,5551234567,Jane,Doe,5559876543,Asthma
```

### Faculty
```csv
first_name,last_name,role,email
Dr. Maria,Garcia,Band 1 Director,maria@ttu.edu
```

### Sessions
```csv
period_number,name,type,location,faculty_id,ensemble,instrument
1,Band 1 Rehearsal,rehearsal,Smith Hall 101,1,Band 1,
1,Trumpet Sectional,sectional,Jones 205,2,,Trumpet
```

### Enrollments
```csv
student_id,session_id
1,5
1,6
```

## Pages

### Teacher (No Auth Required)
- `/` - Faculty search and landing
- `/teacher/[id]` - Dashboard with today's sessions
- `/teacher/[id]/session/[sessionId]` - Attendance taking

### Admin (Password Protected)
- `/admin` - Login page
- `/admin/dashboard` - Statistics and absence/tardy report
- `/admin/data/students` - Student management
- `/admin/data/faculty` - Faculty management
- `/admin/data/sessions` - Session management
- `/admin/import` - Bulk data import
- `/admin/schedule` - Schedule grid view

## Color Scheme

- **Primary (Dark Green)**: `#2d5016` - Headers, main actions
- **Secondary (Light Green)**: `#6ba84d` - Accents, secondary buttons
- **Accent (Sandy)**: `#f4a460` - Highlights, current period

## Development

```bash
# Run dev server
npm run dev

# Build for production
npm build

# Start production server
npm start

# Lint
npm run lint
```

## Database Tables

### students
Core student information, instrument, ensemble, and contact details.

### faculty
Faculty and staff directory with roles.

### periods
Fixed schedule periods (8:00am - 5:50pm, plus assembly).

### sessions
Classes, rehearsals, sections, and other activities assigned to periods.

### session_students
Junction table mapping students to sessions.

### attendance
Daily attendance records (present/absent/tardy).

### schedule_templates
(Optional) Templates for auto-assigning students to sessions.

## Notes

- Database is stored locally in `./data/camp.db`
- No external services or authentication services required
- All data stays on your machine
- Admin password is environment variable based
- Phone-optimized UI for teachers marking attendance
- Desktop-friendly tables for admins

## License

Internal use only - TTU Band and Orchestra Camp

## Support

For issues or feature requests, contact the development team.
