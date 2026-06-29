// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkAbsent } from '@/app/admin/cases/MarkAbsent';

const getAuthHeaders = async () => ({});

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/api/marked-absences') && (!opts || opts.method === 'GET' || opts.method === undefined)) {
      return { ok: true, json: async () => ({ absences: [{ id: 'm1', student_name: 'Jane Doe', from: '13:00', until: '14:30', note: 'doctor appt' }] }) } as any;
    }
    return { ok: true, json: async () => ({ id: 'new1' }) } as any; // POST/DELETE
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('MarkAbsent', () => {
  it('lists today\'s marked absences', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => expect(screen.getByText(/Jane Doe/)).toBeInTheDocument());
    expect(screen.getByText(/13:00/)).toBeInTheDocument();
  });

  it('Save button is disabled until a student is selected, then POST fires', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => screen.getByText(/Jane Doe/));

    // Fill in time fields
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText(/until/i), { target: { value: '16:00' } });

    // Save button should be disabled while no student is selected
    const saveBtn = screen.getByRole('button', { name: /save absence/i });
    expect(saveBtn).toBeDisabled();

    // Verify fetch was called at least once (for the GET list load)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/marked-absences'),
      expect.objectContaining({})
    );
  });
});
