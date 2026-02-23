'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { Teacher } from '@/lib/types'

export default function Home() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadTeachers()
  }, [])

  async function loadTeachers() {
    const q = query(collection(db, 'teachers'), orderBy('name'))
    const snapshot = await getDocs(q)
    const list: Teacher[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Teacher[]
    setTeachers(list)
    setLoading(false)
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏕️</div>
          <h1 className="text-2xl font-bold text-gray-800">Camp Attendance</h1>
          <p className="text-gray-500 mt-1">Select your name to begin</p>
        </div>

        <input
          type="text"
          placeholder="Search for your name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none mb-4 text-gray-700"
        />

        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading teachers...</div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                {search ? 'No teachers found' : 'No teachers loaded yet. Ask your admin to upload data.'}
              </div>
            ) : (
              filtered.map((teacher) => (
                <button
                  key={teacher.id}
                  onClick={() => router.push(`/teacher/${teacher.id}`)}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-green-50 border border-transparent hover:border-green-200 transition-all text-gray-700 font-medium"
                >
                  {teacher.name}
                </button>
              ))
            )}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <button
            onClick={() => router.push('/admin')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Admin Dashboard →
          </button>
        </div>
      </div>
    </div>
  )
}
