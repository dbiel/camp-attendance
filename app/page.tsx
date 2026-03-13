'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Faculty } from '@/lib/types';
import { getCampCode, setCampCode } from '@/lib/camp-code';

export default function TeacherLanding() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [filtered, setFiltered] = useState<Faculty[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [campCode, setCampCodeState] = useState('');
  const [hasCode, setHasCode] = useState(false);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    const stored = getCampCode();
    if (stored) {
      setHasCode(true);
      fetchFaculty();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (search.trim() === '') {
      setFiltered(faculty);
    } else {
      const query = search.toLowerCase();
      setFiltered(
        faculty.filter(
          f =>
            f.first_name.toLowerCase().includes(query) ||
            f.last_name.toLowerCase().includes(query) ||
            f.role.toLowerCase().includes(query)
        )
      );
    }
  }, [search, faculty]);

  async function fetchFaculty() {
    try {
      const res = await fetch('/api/faculty');
      const data = await res.json();
      setFaculty(data);
      setFiltered(data);
    } catch (error) {
      console.error('Error fetching faculty:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campCode.trim()) {
      setCodeError('Please enter the camp code');
      return;
    }
    setCampCode(campCode.trim());
    setHasCode(true);
    setCodeError('');
    setLoading(true);
    fetchFaculty();
  }

  // Camp code entry screen
  if (!hasCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-camp-green to-camp-light flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-camp-green mb-2">TTU Band & Orchestra Camp</h1>
          <p className="text-gray-600 mb-6">Enter the camp code to continue</p>

          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <input
              type="text"
              value={campCode}
              onChange={(e) => setCampCodeState(e.target.value)}
              placeholder="Camp code"
              className="camp-input text-center text-lg"
              autoFocus
            />
            {codeError && <div className="text-red-600 text-sm font-semibold">{codeError}</div>}
            <button type="submit" className="w-full camp-btn-primary py-3 text-lg font-bold">
              Enter
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <Link href="/admin" className="text-camp-green hover:opacity-75 font-medium">
              Admin Portal &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-camp-green to-camp-light p-4 pb-20">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8 text-center pt-8">
        <h1 className="text-4xl font-bold text-white mb-2">TTU Band & Orchestra Camp</h1>
        <p className="text-white text-opacity-90">Select your name to begin</p>
      </div>

      {/* Search Bar */}
      <div className="max-w-2xl mx-auto mb-6">
        <input
          type="text"
          placeholder="Search by name or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border-2 border-white bg-white bg-opacity-20 text-white placeholder-white placeholder-opacity-70 focus:outline-none focus:ring-2 focus:ring-white"
        />
      </div>

      {/* Faculty List */}
      <div className="max-w-2xl mx-auto space-y-2">
        {loading ? (
          <div className="text-center text-white">Loading faculty...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-white">No faculty found</div>
        ) : (
          filtered.map((member) => (
            <Link
              key={member.id}
              href={`/teacher/${member.id}`}
              className="block w-full p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <div className="font-semibold text-camp-green text-lg">
                {member.first_name} {member.last_name}
              </div>
              <div className="text-sm text-gray-600">{member.role}</div>
            </Link>
          ))
        )}
      </div>

      {/* Admin Link */}
      <div className="max-w-2xl mx-auto mt-12 pt-8 border-t border-white border-opacity-20">
        <Link
          href="/admin"
          className="inline-block text-white text-opacity-75 hover:text-opacity-100 font-medium transition-all"
        >
          &rarr; Admin Portal
        </Link>
      </div>
    </div>
  );
}
