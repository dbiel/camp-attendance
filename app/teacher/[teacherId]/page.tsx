'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { Teacher, CampClass } from '@/lib/types'

export default function TeacherDashboard() {
  const params = useParams()
  const router = useRouter()
  const teacherId = params.teacherId as string

  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [classes, setClasses] = useState<CampClass[]>([])
  const [summaries, setSummaries] = useState<Record<string, { total: number; present: number; absent: number; tardy: number; unmarked: number }>>({})
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadData()
  }, [teacherId])

  async function loadData() {
    // Load teacher
    const teacherDoc = await getDoc(doc(db, 'teachers', teacherId))
    if (teacherDoc.exists()) {
      setTeacher({ id: teacherDoc.id, ...teacherDoc.data() } as Teacher)
    }

    // Load classes for this teacher
    const classQuery = query(collection(db, 'classes'), where('teacher_id', '==', teacherId))
    const classSnap = await getDocs(classQuery)
    const classList: CampClass[] = classSnap.docs.map(d => ({ id: d.id, ...d.data() } as CampClass))
    classList.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    setClasses(classList)

    // Load attendance summaries for each class
    const sums: typeof summaries = {}
    for (const cls of classList) {
      // Get enrollments for this class
      const enrollQ = query(collection(db, 'enrollments'), where('class_id', '==', cls.id))
      const enrollSnap = await getDocs(enrollQ)
      const totalEnrolled = enrollSnap.size

      // Get today's attendance for this class
      const attQ = query(
        collection(db, 'attendance'),
        where('class_id', '==', cls.id),
        where('date', '==', today)
      )
      const attSnap = await getDocs(attQ)

      let present = 0, absent = 0, tardy = 0
      attSnap.docs.forEach(d => {
        const s = d.data().status
        if (s === 'present') present++
        else if (s === 'absent') absent++
        else if (s === 'tardy') tardy++
      })

      sums[cls.id] = {
        total: totalEnrolled,
        present,
        absent,
        tardy,
        unmarked: totalEnrolled - present - absent - tardy,
      }
    }
    setSummaries(sums)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-green-200 hover:text-white text-sm">
            ← Switch Teacher
          </button>
          <span className="text-sm text-green-200">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <div className="max-w-lg mx-auto mt-3">
          <h1 className="text-xl font-bold">{teacher?.name}</h1>
          <p className="text-green-200 text-sm">Your Classes</p>
        </div>
      </div>

      {/* Class List */}
      <div className="max-w-lg mx-auto p-4 space-y-3">
        {classes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
            No classes assigned to you yet.
          </div>
        ) : (
          classes.map((cls) => {
            const s = summaries[cls.id] || { total: 0, present: 0, absent: 0, tardy: 0, unmarked: 0 }
            const allMarked = s.unmarked === 0 && s.total > 0
            return (
              <button
                key={cls.id}
                onClick={() => router.push(`/teacher/${teacherId}/class/${cls.id}`)}
                className="w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">{cls.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      {cls.period && <span>Period {cls.period}</span>}
                      {cls.start_time && cls.end_time && (
                        <span>{cls.start_time} – {cls.end_time}</span>
                      )}
                      {cls.location && <span>📍 {cls.location}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {allMarked ? (
                      <span className="text-green-600 text-sm font-medium">✓ Done</span>
                    ) : s.total > 0 ? (
                      <span className="text-orange-500 text-sm font-medium">{s.unmarked} left</span>
                    ) : (
                      <span className="text-gray-400 text-sm">No students</span>
                    )}
                  </div>
                </div>
                {s.total > 0 && (
                  <div className="mt-3 flex gap-3 text-xs">
                    <span className="text-green-600">✓ {s.present}</span>
                    <span className="text-red-500">✗ {s.absent}</span>
                    <span className="text-orange-500">⏱ {s.tardy}</span>
                    <span className="text-gray-400">— {s.unmarked}</span>
                    <span className="ml-auto text-gray-400">{s.total} students</span>
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
