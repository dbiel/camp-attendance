'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type ImportType = 'students' | 'faculty' | 'sessions' | 'enrollments';

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export default function ImportPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [importType, setImportType] = useState<ImportType>('students');
  const [fileContent, setFileContent] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
    }
  }, [user, authLoading]);

  function parseCSV(content: string): any[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }

    return rows;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const content = e.target.value;
    setFileContent(content);
    setPreview(parseCSV(content).slice(0, 5));
  }

  async function handleImport() {
    if (!fileContent.trim()) {
      alert('Please paste CSV data');
      return;
    }

    const data = parseCSV(fileContent);
    if (data.length === 0) {
      alert('No data to import');
      return;
    }

    setImporting(true);
    try {
      const headers = await getAuthHeaders();
      const endpoint = `/api/import/${importType}`;
      const payload =
        importType === 'enrollments'
          ? { enrollments: data }
          : importType === 'sessions'
            ? { sessions: data }
            : importType === 'faculty'
              ? { faculty: data }
              : { students: data };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      });

      const resultData = await res.json();
      setResult(resultData);
    } catch (error) {
      console.error('Error importing:', error);
      setResult({ success: 0, failed: data.length, errors: ['Import failed'] });
    } finally {
      setImporting(false);
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link href="/admin/dashboard" className="text-sm opacity-75 hover:opacity-100 mb-2 block">
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Import Data</h1>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Import Type Selection */}
        <div className="camp-card p-4 mb-6">
          <label className="camp-label">Data Type to Import</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['students', 'faculty', 'sessions', 'enrollments'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setImportType(type);
                  setFileContent('');
                  setPreview([]);
                  setResult(null);
                }}
                className={`p-3 rounded-lg font-semibold transition-all ${
                  importType === type
                    ? 'bg-camp-green text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* CSV Input */}
        <div className="camp-card p-4 mb-6">
          <label className="camp-label">Paste CSV Data</label>
          <p className="text-xs text-gray-600 mb-2">
            {importType === 'students' &&
              'Columns: first_name, last_name, preferred_name, gender, division, instrument, ensemble, chair_number, dorm_building, dorm_room, email, cell_phone, parent_first_name, parent_last_name, parent_phone, medical_notes'}
            {importType === 'faculty' &&
              'Columns: first_name, last_name, role, email'}
            {importType === 'sessions' &&
              'Columns: period_number, name, type, location, faculty_id, ensemble, instrument'}
            {importType === 'enrollments' &&
              'Columns: student_id, session_id'}
          </p>
          <textarea
            value={fileContent}
            onChange={handleFileChange}
            placeholder="Paste your CSV data here..."
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-camp-green h-40"
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="camp-card p-4 mb-6">
            <h3 className="font-bold text-camp-green mb-3">Preview ({preview.length} rows shown)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    {Object.keys(preview[0]).map((key) => (
                      <th key={key} className="px-2 py-1 text-left">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      {Object.values(row).map((val, vIdx) => (
                        <td key={vIdx} className="px-2 py-1 text-gray-700">
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={importing || fileContent.trim().length === 0}
          className="w-full camp-btn-primary py-3 text-lg font-bold disabled:opacity-50"
        >
          {importing ? 'Importing...' : 'Import'}
        </button>

        {/* Results */}
        {result && (
          <div className="camp-card p-4 mt-6 border-l-4 border-camp-green">
            <h3 className="font-bold text-camp-green mb-2">Import Results</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Success:</span> {result.success}
              </p>
              <p>
                <span className="font-semibold">Failed:</span> {result.failed}
              </p>
              {result.errors.length > 0 && (
                <div>
                  <p className="font-semibold">Errors:</p>
                  <ul className="list-disc list-inside text-red-600">
                    {result.errors.slice(0, 10).map((err, idx) => (
                      <li key={idx} className="text-xs">
                        {err}
                      </li>
                    ))}
                    {result.errors.length > 10 && (
                      <li className="text-xs">... and {result.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
