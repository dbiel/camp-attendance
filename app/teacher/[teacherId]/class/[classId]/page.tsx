'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import {
  doc, getDoc, collection, getDocs, query, where,
  setDoc, Timestamp
} from 'firebase/firestore'
import { Student, CampClass, AttendanceStatus } from '@/lib/types'

interface StudentAttendance {
  student: Student
  status: AttendanceStatus
  attendanceDocId: string | null
}

export default function ClassAttendance() {
  const params = useParams()
  const router = useRouter()
  const teacherId = params.teacherId as string
  const classId = params.classId as string

  const [campClass, setCampClass] = useState<CampClass | null>(null)
  const [students, setStudents] = useState<StudentAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [markAllAbsentDone, setMarkAllAbsentDone] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const loadData = useCallback(async () => {
    // Load class info
    const classDoc = await getDoc(doc(db, 'classes', classId))
    if (classDoc.exists()) {
      setCampClass({ id: classDoc.id, ...classDoc.data() } as CampClass)
    }

    // Load enrolled students for this class
    const enrollQ = query(collection(db, 'enrollments'), where('class_id', '==', classId))
    const enrollSnap = await getDocs(enrollQ)

    // Get student details for each enrollment
    const studentIds = enrollSnap.docs.map(d => d.data().student_id)

    // Load attendance for today
    const attQ = query(
      collection(db, 'attendance'),
      where('class_id', '==', classId),
      where('date', '==', today)
    )
    const attSnap = await getDocs(attQ)
    const attendanceMap = new Map<string, { status: string; docId: string }>()
    attSnap.docs.forEach(d => {
      const data = d.data()
      attendanceMap.set(data.student_id, { status: data.status, docId: d.id })
    })

    // Load each student
    const studentList: StudentAttendance[] = []
    for (const sid of studentIds) {
      const studentDoc = await getDoc(doc(db, 'students', sid))
      if (studentDoc.exists()) {
        const att = attendanceMap.get(sid)
        studentList.push({
          student: { id: studentDoc.id, ...studentDoc.data() } as Student,
          status: (att?.status as AttendanceStatus) || 'unmarked',
          attendanceDocId: att?.docId || null,
        })
      }
    }

    studentList.sort((a, b) => a.student.name.localeCompare(b.student.name))
    setStudents(studentList)
    setLoading(false)
  }, [classId, today])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function toggleStatus(studentId: string, currentStatus: AttendanceStatus) {
    const now = new Date()
    const classStarted = campClass?.start_time
      ? (() => {
          const [h, m] = campClass.start_time!.split(':').map(Number)
          const startDate = new Date()
          startDate.setHours(h, m, 0, 0)
          return now > startDate
        })()
      : false

    let newStatus: AttendanceStatus
    if (currentStatus === 'unmarked' || currentStatus === 'absent') {
      newStatus = (currentStatus === 'absent' && classStarted) ? 'tardy' : 'present'
    } else if (currentStatus === 'present') {
      newStatus = 'absent'
    } else if (currentStatus === 'tardy') {
      newStatus = 'absent'
    } else {
      newStatus = 'present'
    }

    setSaving(studentId)

    // Use a deterministic document ID so upserts work naturally
    const docId = `${studentId}_${classId}_${today}`
    await setDoc(doc(db, 'attendance', docId), {
      student_id: studentId,
      class_id: classId,
      date: today,
      status: newStatus,
      marked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    setStudents(prev =>
      prev.map(s =>
        s.student.id === studentId
          ? { ...s, status: newStatus, attendanceDocId: docId }
          : s
      )
    )
    setSaving(null)
  }

  async function markAllAbsent() {
    const unmarked = students.filter(s => s.status === 'unmarked')
    if (unmarked.length === 0) return

    const promises = unmarked.map(s => {
      const docId = `${s.student.id}_${classId}_${today}`
      return setDoc(doc(db, 'attendance', docId), {
        student_id: s.student.id,
        class_id: classId,
        date: today,
        status: 'absent',
        marked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    })

    await Promise.all(promises)

    setStudents(prev =>
      prev.map(s =>
        s.status === 'unmarked'
          ? { ...s, status: 'absent' as AttendanceStatus }
          : s
      )
    )
    setMarkAllAbsentDone(true)
    setTimeout(() => setMarkAllAbsentDone(false), 2000)
  }

  const statusColors: Record<AttendanceStatus, string> = {
    present: 'bg-green-100 border-green-400 text-green-800',
    absent: 'bg-red-100 border-red-400 text-red-800',
    tardy: 'bg-orange-100 border-orange-400 text-orange-800',
    unmarked: 'bg-gray-100 border-gray-300 text-gray-500',
  }

  const statusLabels: Record<AttendanceStatus, string> = {
    present: '✓ Present',
    absent: '✗ Absent',
    tardy: '⏱ Tardy',
    unmarked: '—',
  }

  const presentCount = students.filter(s => s.status === 'present').length
  const absentCount = students.filter(s => s.status === 'absent').length
  const tardyCount = students.filter(s => s.status === 'tardy').length
  const unmarkedCount = students.filter(s => s.status === 'unmarked').length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => router.push(`/teacher/${teacherId}`)}
            className="text-green-200 hover:text-white text-sm mb-2 block"
          >
            ← Back to My Classes
          </button>
          <h1 className="text-xl font-bold">{campClass?.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-green-200">
            {campClass?.period && <span>Period {campClass.period}</span>}
            {campClass?.start_time && campClass?.end_time && (
              <span>{campClass.start_time} – {campClass.end_time}</span>
            )}
            {campClass?.location && <span>📍 {campClass.location}</span>}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between text-sm">
          <div className="flex gap-4">
            <span className="text-green-600 font-medium">✓ {presentCount}</span>
            <span className="text-red-500 font-medium">✗ {absentCount}</span>
            <span className="text-orange-500 font-medium">⏱ {tardyCount}</span>
            {unmarkedCount > 0 && <span className="text-gray-400">— {unmarkedCount}</span>}
          </div>
          <span className="text-gray-400">{students.length} students</span>
        </div>
      </div>

      {/* Student List */}
      <div className="max-w-lg mx-auto p-4 space-y-2">
        {students.map(({ student, status }) => (
          <div
            key={student.id}
            className="bg-white rounded-lg border border-gray-100 shadow-sm flex items-center justify-between px-4 py-3"
          >
            <div>
              <span className="font-medium text-gray-800">{student.name}</span>
              {student.dorm_room && (
                <span className="text-xs text-gray-400 ml-2">Room {student.dorm_room}</span>
              )}
            </div>
            <button
              onClick={() => toggleStatus(student.id, status)}
              disabled={saving === student.id}
              className={`status-btn px-4 py-1.5 rounded-full text-sm font-medium border ${statusColors[status]} ${
                saving === student.id ? 'opacity-50' : 'hover:opacity-80'
              }`}
            >
              {statusLabels[status]}
            </button>
          </div>
        ))}
      </div>

      {/* Bottom Action Bar */}
      {unmarkedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg">
          <div className="max-w-lg mx-auto">
            <button
              onClick={markAllAbsent}
              className="w-full bg-red-50 text-red-600 border border-red-200 rounded-lg py-3 font-medium hover:bg-red-100 transition-colors"
            >
              {markAllAbsentDone ? '✓ Done!' : `Mark ${unmarkedCount} Unmarked as Absent`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
