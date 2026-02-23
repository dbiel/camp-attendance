'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'

interface AbsenceRecord {
  student_name: string
  student_id: string
  class_name: string
  class_id: string
  teacher_name: string
  status: string
  dorm_room: string | null
  period: string | null
  start_time: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  medical_notes: string | null
}

interface StudentScheduleItem {
  class_name: string
  teacher_name: string
  period: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  status: string | null
}

interface StudentDetail {
  id: string
  name: string
  age: number | null
  dorm_room: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  medical_notes: string | null
  additional_info: Record<string, any> | null
  schedule: StudentScheduleItem[]
}

export default function AdminDashboard() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [absences, setAbsences] = useState<AbsenceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filterClass, setFilterClass] = useState('')
  const [filterDorm, setFilterDorm] = useState('')
  const [searchStudent, setSearchStudent] = useState('')
  const [allClasses, setAllClasses] = useState<{ id: string; name: string }[]>([])
  const [allDorms, setAllDorms] = useState<string[]>([])
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null)
  const [showTardy, setShowTardy] = useState(true)
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, tardy: 0, unmarked: 0 })

  const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'camp2026'

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      setPasswordError(false)
    } else {
      setPasswordError(true)
    }
  }

  useEffect(() => {
    if (authenticated) {
      loadData()
    }
  }, [authenticated, date])

  async function loadData() {
    setLoading(true)

    // Load all classes for filter dropdown
    const classSnap = await getDocs(collection(db, 'classes'))
    const classList = classSnap.docs.map(d => ({ id: d.id, name: d.data().name })).sort((a, b) => a.name.localeCompare(b.name))
    setAllClasses(classList)

    // Build a map of classes
    const classMap = new Map<string, any>()
    classSnap.docs.forEach(d => classMap.set(d.id, { id: d.id, ...d.data() }))

    // Load all students
    const studentSnap = await getDocs(collection(db, 'students'))
    const studentMap = new Map<string, any>()
    const dorms = new Set<string>()
    studentSnap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() }
      studentMap.set(d.id, data)
      if (data.dorm_room) dorms.add(data.dorm_room)
    })
    setAllDorms([...dorms].sort())

    // Load all teachers
    const teacherSnap = await getDocs(collection(db, 'teachers'))
    const teacherMap = new Map<string, string>()
    teacherSnap.docs.forEach(d => teacherMap.set(d.id, d.data().name))

    // Load all enrollments
    const enrollSnap = await getDocs(collection(db, 'enrollments'))

    // Load attendance for selected date
    const attQ = query(collection(db, 'attendance'), where('date', '==', date))
    const attSnap = await getDocs(attQ)
    const attendanceMap = new Map<string, string>() // "studentId_classId" -> status
    attSnap.docs.forEach(d => {
      const data = d.data()
      attendanceMap.set(`${data.student_id}_${data.class_id}`, data.status)
    })

    let totalCount = 0, presentCount = 0, absentCount = 0, tardyCount = 0, unmarkedCount = 0
    const absentList: AbsenceRecord[] = []

    enrollSnap.docs.forEach(d => {
      const e = d.data()
      totalCount++
      const key = `${e.student_id}_${e.class_id}`
      const status = attendanceMap.get(key)
      const student = studentMap.get(e.student_id)
      const cls = classMap.get(e.class_id)

      if (!student || !cls) return

      const teacherName = teacherMap.get(cls.teacher_id) || 'Unknown'

      if (status === 'present') {
        presentCount++
      } else {
        const recordStatus = status || 'unmarked'
        if (status === 'tardy') tardyCount++
        else if (status === 'absent') absentCount++
        else unmarkedCount++

        absentList.push({
          student_name: student.name,
          student_id: student.id,
          class_name: cls.name,
          class_id: cls.id,
          teacher_name: teacherName,
          status: recordStatus,
          dorm_room: student.dorm_room,
          period: cls.period,
          start_time: cls.start_time,
          parent_name: student.parent_name,
          parent_phone: student.parent_phone,
          parent_email: student.parent_email,
          medical_notes: student.medical_notes,
        })
      }
    })

    setStats({ total: totalCount, present: presentCount, absent: absentCount, tardy: tardyCount, unmarked: unmarkedCount })
    setAbsences(absentList)
    setLoading(false)
  }

  async function viewStudent(studentId: string) {
    const studentDoc = await getDoc(doc(db, 'students', studentId))
    if (!studentDoc.exists()) return
    const student = { id: studentDoc.id, ...studentDoc.data() } as any

    // Get enrollments
    const enrollQ = query(collection(db, 'enrollments'), where('student_id', '==', studentId))
    const enrollSnap = await getDocs(enrollQ)

    // Get attendance for today
    const attQ = query(
      collection(db, 'attendance'),
      where('student_id', '==', studentId),
      where('date', '==', date)
    )
    const attSnap = await getDocs(attQ)
    const attMap = new Map<string, string>()
    attSnap.docs.forEach(d => {
      const data = d.data()
      attMap.set(data.class_id, data.status)
    })

    const schedule: StudentScheduleItem[] = []
    for (const eDoc of enrollSnap.docs) {
      const e = eDoc.data()
      const classDoc = await getDoc(doc(db, 'classes', e.class_id))
      if (!classDoc.exists()) continue
      const cls = classDoc.data()

      // Get teacher name
      let teacherName = 'Unknown'
      if (cls.teacher_id) {
        const tDoc = await getDoc(doc(db, 'teachers', cls.teacher_id))
        if (tDoc.exists()) teacherName = tDoc.data().name
      }

      schedule.push({
        class_name: cls.name,
        teacher_name: cls.teacher_name || teacherName,
        period: cls.period,
        start_time: cls.start_time,
        end_time: cls.end_time,
        location: cls.location,
        status: attMap.get(e.class_id) || null,
      })
    }

    schedule.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

    setSelectedStudent({
      ...student,
      schedule,
    })
  }

  const filteredAbsences = absences.filter(a => {
    if (!showTardy && a.status === 'tardy') return false
    if (filterClass && a.class_id !== filterClass) return false
    if (filterDorm && a.dorm_room !== filterDorm) return false
    if (searchStudent && !a.student_name.toLowerCase().includes(searchStudent.toLowerCase())) return false
    return true
  })

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-800 to-gray-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔒</div>
            <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false) }}
              className={`w-full px-4 py-3 rounded-lg border ${passwordError ? 'border-red-400' : 'border-gray-200'} focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none mb-3`}
              autoFocus
            />
            {passwordError && <p className="text-red-500 text-sm mb-3">Incorrect password</p>}
            <button type="submit" className="w-full bg-green-600 text-white rounded-lg py-3 font-medium hover:bg-green-700 transition-colors">
              Log In
            </button>
          </form>
          <button onClick={() => router.push('/')} className="block w-full text-center text-sm text-gray-400 mt-4 hover:text-gray-600">
            ← Back to Teacher View
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-400 text-sm">Camp Attendance Overview</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/upload')} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors">
              📤 Upload Data
            </button>
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">
              Teacher View →
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        {/* Date Picker & Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div className="flex gap-6 ml-auto">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.present}</div>
                <div className="text-xs text-gray-400">Present</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">{stats.absent}</div>
                <div className="text-xs text-gray-400">Absent</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-500">{stats.tardy}</div>
                <div className="text-xs text-gray-400">Tardy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-400">{stats.unmarked}</div>
                <div className="text-xs text-gray-400">Unmarked</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex flex-wrap gap-3">
            <input type="text" placeholder="Search student..." value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm flex-1 min-w-48" />
            <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="">All Classes</option>
              {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filterDorm} onChange={(e) => setFilterDorm(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="">All Dorms</option>
              {allDorms.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={showTardy} onChange={(e) => setShowTardy(e.target.checked)} className="rounded" />
              Show tardy
            </label>
          </div>
        </div>

        {/* Absence Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading attendance data...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Class</th>
                    <th className="px-4 py-3 text-left">Teacher</th>
                    <th className="px-4 py-3 text-left">Dorm</th>
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-left">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAbsences.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        No absences found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAbsences.map((record, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <button onClick={() => viewStudent(record.student_id)} className="text-blue-600 hover:underline font-medium">
                            {record.student_name}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            record.status === 'absent' ? 'bg-red-100 text-red-700' :
                            record.status === 'tardy' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{record.class_name}</td>
                        <td className="px-4 py-3 text-gray-500">{record.teacher_name}</td>
                        <td className="px-4 py-3 text-gray-500">{record.dorm_room || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {record.period || '—'}
                          {record.start_time && ` (${record.start_time})`}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{record.parent_phone || record.parent_email || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500 border-t border-gray-100">
              Showing {filteredAbsences.length} records
            </div>
          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{selectedStudent.name}</h2>
                  {selectedStudent.age && <span className="text-gray-400 text-sm">Age {selectedStudent.age}</span>}
                </div>
                <button onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase">Dorm Room</div>
                  <div className="font-medium text-gray-700">{selectedStudent.dorm_room || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase">Parent/Guardian</div>
                  <div className="font-medium text-gray-700">{selectedStudent.parent_name || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase">Phone</div>
                  <div className="font-medium text-gray-700">{selectedStudent.parent_phone || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase">Email</div>
                  <div className="font-medium text-gray-700 text-sm break-all">{selectedStudent.parent_email || '—'}</div>
                </div>
              </div>

              {selectedStudent.medical_notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
                  <div className="text-xs text-yellow-600 uppercase font-medium mb-1">Medical Notes</div>
                  <div className="text-sm text-yellow-800">{selectedStudent.medical_notes}</div>
                </div>
              )}

              {selectedStudent.additional_info && Object.keys(selectedStudent.additional_info).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">Additional Info</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedStudent.additional_info).map(([key, value]) => (
                      <div key={key} className="bg-gray-50 rounded-lg p-2">
                        <div className="text-xs text-gray-400">{key}</div>
                        <div className="text-sm text-gray-700">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">Today&apos;s Schedule</h3>
              <div className="space-y-2">
                {selectedStudent.schedule.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <div className="font-medium text-gray-700 text-sm">{s.class_name}</div>
                      <div className="text-xs text-gray-400">
                        {s.teacher_name}
                        {s.period && ` · Period ${s.period}`}
                        {s.start_time && ` · ${s.start_time}`}
                        {s.end_time && `–${s.end_time}`}
                        {s.location && ` · ${s.location}`}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'present' ? 'bg-green-100 text-green-700' :
                      s.status === 'absent' ? 'bg-red-100 text-red-700' :
                      s.status === 'tardy' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {s.status || 'unmarked'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
