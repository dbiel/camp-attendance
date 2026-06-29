// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkAbsent } from '@/app/admin/cases/MarkAbsent';

const getAuthHeaders = async () => ({});

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/api/marked-absences') && (!opts || opts.method === 'GET' || opts.method === undefined)) {
      return { ok: true, json: async () => ({ absences: [
        { id: 'm1', student_name: 'Jane Doe', date: '2026-06-29', all_day: false, from: '13:00', until: '14:30', note: 'doctor appt' },
        { id: 'm2', student_name: 'Sam Poe', date: '2026-07-01', all_day: true, from: '00:00', until: '23:59', note: null },
      ] }) } as any;
    }
    return { ok: true, json: async () => ({ id: 'new1' }) } as any;
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('MarkAbsent date + all-day', () => {
  it('lists upcoming absences with a date label and "All day"', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => expect(screen.getByText(/Jane Doe/)).toBeInTheDocument());
    expect(screen.getByText(/All day/)).toBeInTheDocument();      // Sam Poe's row
    expect(screen.getByText(/13:00/)).toBeInTheDocument();        // Jane's timed row
  });

  it('all-day toggle hides the From/Until inputs', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => screen.getByText(/Jane Doe/));
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/all day/i));
    expect(screen.queryByLabelText(/from/i)).toBeNull();
  });
});
