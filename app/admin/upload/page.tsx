'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, addDoc, getDocs, query, where, writeBatch, doc, deleteDoc } from 'firebase/firestore'
import Papa from 'papaparse'

type UploadType = 'teachers' | 'students' | 'classes' | 'enrollments'

interface UploadResult {
  type: UploadType
  success: number
  errors: string[]
}

export default function UploadPage() {
  const router = useRouter()
  const [results, setResults] = useState<UploadResult[]>([])
  const [uploading, setUploading] = useState<UploadType | null>(null)
  const [clearConfirm, setClearConfirm] = useState<string | null>(null)

  async function handleUpload(type: UploadType, file: File) {
    setUploading(type)
    const text = await file.text()
    const { data: rows } = Papa.parse(text, { header: true, skipEmptyLines: true })

    let success = 0
    const errors: string[] = []

    if (type === 'teachers') {
      for (const row of rows as any[]) {
        const name = row.name?.trim()
        if (!name) { errors.push('Skipped row: missing name'); continue }
        try {
          await addDoc(collection(db, 'teachers'), {
            name,
            email: row.email?.trim() || null,
          })
          success++
        } catch (err: any) {
          errors.push(`${name}: ${err.message}`)
        }
      }
    }

    if (type === 'students') {
      for (const row of rows as any[]) {
        const name = row.name?.trim()
        if (!name) { errors.push('Skipped row: missing name'); continue }

        const known = ['name', 'age', 'dorm_room', 'parent_name', 'parent_phone', 'parent_email', 'medical_notes']
        const additional: Record<string, any> = {}
        for (const [key, value] of Object.entries(row)) {
          if (!known.includes(key) && value && (value as string).trim()) {
            additional[key] = (value as string).trim()
          }
        }

        try {
          await addDoc(collection(db, 'students'), {
            name,
            age: row.age ? parseInt(row.age) : null,
            dorm_room: row.dorm_room?.trim() || null,
            parent_name: row.parent_name?.trim() || null,
            parent_phone: row.parent_phone?.trim() || null,
            parent_email: row.parent_email?.trim() || null,
            medical_notes: row.medical_notes?.trim() || null,
            additional_info: Object.keys(additional).length > 0 ? additional : null,
          })
          success++
        } catch (err: any) {
          errors.push(`${name}: ${err.message}`)
        }
      }
    }

    if (type === 'classes') {
      for (const row of rows as any[]) {
        const name = row.name?.trim()
        const teacherName = row.teacher_name?.trim()
        if (!name) { errors.push('Skipped row: missing class name'); continue }

        let teacherId = null
        if (teacherName) {
          // Find teacher by name
          const teacherQ = query(collection(db, 'teachers'), where('name', '==', teacherName))
          const teacherSnap = await getDocs(teacherQ)
          if (teacherSnap.size > 0) {
            teacherId = teacherSnap.docs[0].id
          } else {
            errors.push(`${name}: teacher "${teacherName}" not found`)
          }
        }

        try {
          await addDoc(collection(db, 'classes'), {
            name,
            teacher_id: teacherId,
            teacher_name: teacherName || null,
            period: row.period?.trim() || null,
            start_time: row.start_time?.trim() || null,
            end_time: row.end_time?.trim() || null,
            location: row.location?.trim() || null,
          })
          success++
        } catch (err: any) {
          errors.push(`${name}: ${err.message}`)
        }
      }
    }

    if (type === 'enrollments') {
      for (const row of rows as any[]) {
        const studentName = row.student_name?.trim()
        const className = row.class_name?.trim()
        if (!studentName || !className) {
          errors.push('Skipped row: missing student_name or class_name')
          continue
        }

        // Find student
        const studentQ = query(collection(db, 'students'), where('name', '==', studentName))
        const studentSnap = await getDocs(studentQ)

        // Find class
        const classQ = query(collection(db, 'classes'), where('name', '==', className))
        const classSnap = await getDocs(classQ)

        if (studentSnap.size === 0) { errors.push(`"${studentName}": student not found`); continue }
        if (classSnap.size === 0) { errors.push(`"${className}": class not found`); continue }

        const studentId = studentSnap.docs[0].id
        const classId = classSnap.docs[0].id

        // Check for duplicate enrollment
        const dupeQ = query(
          collection(db, 'enrollments'),
          where('student_id', '==', studentId),
          where('class_id', '==', classId)
        )
        const dupeSnap = await getDocs(dupeQ)
        if (dupeSnap.size > 0) continue // already enrolled

        try {
          await addDoc(collection(db, 'enrollments'), {
            student_id: studentId,
            class_id: classId,
            student_name: studentName,
            class_name: className,
          })
          success++
        } catch (err: any) {
          errors.push(`${studentName} → ${className}: ${err.message}`)
        }
      }
    }

    setResults(prev => [...prev, { type, success, errors }])
    setUploading(null)
  }

  async function clearCollection(collectionName: string) {
    const snap = await getDocs(collection(db, collectionName))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    setClearConfirm(null)
  }

  function FileUploadBox({ type, title, description, columns }: {
    type: UploadType
    title: string
    description: string
    columns: string
  }) {
    const result = results.find(r => r.type === type)

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <div className="flex gap-2">
            {clearConfirm === type ? (
              <div className="flex gap-1">
                <button onClick={() => clearCollection(type)} className="text-xs bg-red-500 text-white px-2 py-1 rounded">
                  Confirm Clear
                </button>
                <button onClick={() => setClearConfirm(null)} className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setClearConfirm(type)} className="text-xs text-red-400 hover:text-red-600">
                Clear All
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-1">{description}</p>
        <p className="text-xs text-gray-400 font-mono mb-3">Columns: {columns}</p>

        <label className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          uploading === type ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-green-400 hover:bg-green-50'
        }`}>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={uploading !== null}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(type, file)
              e.target.value = ''
            }}
          />
          {uploading === type ? (
            <span className="text-green-600 text-sm">Uploading...</span>
          ) : (
            <span className="text-gray-400 text-sm">Drop CSV here or click to upload</span>
          )}
        </label>

        {result && (
          <div className="mt-3">
            <div className="text-sm text-green-600">✓ {result.success} records imported</div>
            {result.errors.length > 0 && (
              <details className="mt-1">
                <summary className="text-sm text-orange-500 cursor-pointer">{result.errors.length} warnings/errors</summary>
                <div className="mt-1 max-h-32 overflow-y-auto text-xs text-gray-500 bg-gray-50 rounded p-2">
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => router.push('/admin')} className="text-gray-400 hover:text-white text-sm mb-1 block">
            ← Back to Dashboard
          </button>
          <h1 className="text-xl font-bold">Upload Data</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-blue-800 mb-2">Upload Order Matters!</h2>
          <div className="text-sm text-blue-700 space-y-1">
            <p>Upload your CSV files in this order:</p>
            <p><strong>1. Teachers</strong> → <strong>2. Students</strong> → <strong>3. Classes</strong> (references teachers) → <strong>4. Enrollments</strong> (references students & classes)</p>
            <p className="mt-2 text-blue-600">Any extra columns in your student CSV will be saved automatically as additional info.</p>
          </div>
        </div>

        <div className="space-y-4">
          <FileUploadBox type="teachers" title="1. Teachers" description="Upload your list of teachers/counselors." columns="name, email (optional)" />
          <FileUploadBox type="students" title="2. Students" description="Upload student info. Extra columns are saved as additional info." columns="name, age, dorm_room, parent_name, parent_phone, parent_email, medical_notes, [any extra columns]" />
          <FileUploadBox type="classes" title="3. Classes" description="Upload classes/activities. Teacher name must match a teacher already uploaded." columns="name, teacher_name, period, start_time (HH:MM), end_time (HH:MM), location" />
          <FileUploadBox type="enrollments" title="4. Enrollments" description="Map students to their classes. Names must match exactly." columns="student_name, class_name" />
        </div>
      </div>
    </div>
  )
}
