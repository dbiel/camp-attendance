// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkedAbsentList } from '@/app/admin/cases/MarkedAbsentList';

const getAuthHeaders = async () => ({});

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/api/marked-absences') && (!opts || opts.method === 'GET' || opts.method === undefined)) {
      return { ok: true, json: async () => ({ absences: [
        { id: 'm1', student_name: 'Jane Doe', date: '2026-06-29', all_day: false, from: '13:00', until: '14:30', note: 'doctor appt' },
        { id: 'm2', student_name: 'Sam Poe', date: '2026-07-01', all_day: true, from: '00:00', until: '23:59', note: null },
      ] }) } as any;
    }
    return { ok: true, json: async () => ({ id: 'ok' }) } as any;
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('MarkedAbsentList (always-on board section)', () => {
  it('lists office-marked absences with name, range and All day', async () => {
    render(<MarkedAbsentList getAuthHeaders={getAuthHeaders} refreshKey={0} />);
    await waitFor(() => expect(screen.getByText(/Jane Doe/)).toBeInTheDocument());
    expect(screen.getByText(/Sam Poe/)).toBeInTheDocument();
    expect(screen.getByText(/All day/)).toBeInTheDocument();   // Sam Poe's row
    expect(screen.getByText(/13:00/)).toBeInTheDocument();     // Jane's timed row
  });

  it('Clear removes the row and DELETEs the absence', async () => {
    render(<MarkedAbsentList getAuthHeaders={getAuthHeaders} refreshKey={0} />);
    await waitFor(() => screen.getByText(/Jane Doe/));
    const rows = screen.getAllByRole('button', { name: /clear/i });
    fireEvent.click(rows[0]!);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/marked-absences/m1',
        expect.objectContaining({ method: 'DELETE' })
      )
    );
  });

  it('shows an empty state when there are none', async () => {
    (global.fetch as any) = vi.fn(async () => ({ ok: true, json: async () => ({ absences: [] }) }));
    render(<MarkedAbsentList getAuthHeaders={getAuthHeaders} refreshKey={0} />);
    await waitFor(() => expect(screen.getByText(/No office-marked absences/i)).toBeInTheDocument());
  });
});
