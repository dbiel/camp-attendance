'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface ScheduleItem {
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  session_id?: string;
  session_name?: string;
  type?: string;
  location?: string;
  ensemble?: string;
  instrument?: string;
  faculty_name?: string;
  student_count?: number;
}

export default function SchedulePage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ensembles, setEnsembles] = useState<string[]>([]);
  const [selectedEnsemble, setSelectedEnsemble] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) fetchSchedule();
  }, [user, authLoading]);

  async function fetchSchedule() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/schedule', { headers });
      const data = await res.json();
      setSchedule(data);

      const uniqueEnsembles = Array.from(new Set(data.filter((s: any) => s.ensemble).map((s: any) => s.ensemble))).sort() as string[];
      setEnsembles(uniqueEnsembles);
      if (uniqueEnsembles.length > 0) {
        setSelectedEnsemble(uniqueEnsembles[0]);
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>;
  }

  const periods = Array.from(new Map(schedule.map((s) => [s.period_number, s])).values());

  const filteredSchedule = selectedEnsemble
    ? schedule.filter((s) => !s.ensemble || s.ensemble === selectedEnsemble)
    : schedule;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link href="/admin/dashboard" className="text-sm opacity-75 hover:opacity-100 mb-2 block">
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Schedule Grid</h1>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="mb-6">
          <label className="camp-label">Filter by Ensemble</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedEnsemble('')}
              className={`px-4 py-2 rounded-lg font-semibold ${
                selectedEnsemble === '' ? 'bg-camp-green text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              All
            </button>
            {ensembles.map((ens) => (
              <button
                key={ens}
                onClick={() => setSelectedEnsemble(ens)}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  selectedEnsemble === ens ? 'bg-camp-green text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {ens}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-600 py-8">Loading...</div>
        ) : (
          <div className="camp-card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold w-32">Period</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Time</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Session</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Type</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Ensemble/Instrument</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Location</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Faculty</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-bold">Students</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const periodSessions = filteredSchedule.filter((s) => s.period_number === period.period_number);

                  return (
                    <tr key={period.period_number} className="border-b border-gray-300">
                      <td className="border border-gray-300 px-3 py-2 font-bold bg-gray-50">{period.period_name}</td>
                      <td className="border border-gray-300 px-3 py-2 text-gray-600 bg-gray-50">
                        {period.start_time} - {period.end_time}
                      </td>
                      <td colSpan={6} className="border border-gray-300 p-0">
                        {periodSessions.length === 0 ? (
                          <div className="px-3 py-2 text-gray-500">No sessions</div>
                        ) : (
                          <table className="w-full">
                            <tbody>
                              {periodSessions.map((session, idx) => (
                                <tr key={idx} className={idx > 0 ? 'border-t border-gray-200' : ''}>
                                  <td className="border-r border-gray-300 px-3 py-2">{session.session_name || '-'}</td>
                                  <td className="border-r border-gray-300 px-3 py-2 text-xs">{session.type || '-'}</td>
                                  <td className="border-r border-gray-300 px-3 py-2">
                                    {session.ensemble || session.instrument || '-'}
                                  </td>
                                  <td className="border-r border-gray-300 px-3 py-2 text-gray-600">{session.location || '-'}</td>
                                  <td className="border-r border-gray-300 px-3 py-2 text-gray-600">{session.faculty_name || '-'}</td>
                                  <td className="px-3 py-2 text-right">{session.student_count || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
