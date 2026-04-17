// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { StudentDetailModal } from '@/app/admin/dashboard/StudentDetailModal';

// Mock the auth-context so the modal can fetch auth headers in tests.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'admin-test' },
    loading: false,
    getAuthHeaders: async () => ({ Authorization: 'Bearer test-token' }),
    signIn: async () => {},
    signOut: async () => {},
  }),
}));

const mockStudent = {
  id: 'stu-1',
  first_name: 'Alice',
  last_name: 'Smith',
  last_initial: 'S',
  preferred_name: 'Allie',
  gender: 'F',
  division: 'Overnight',
  instrument: 'Flute',
  ensemble: 'Band 1',
  chair_number: 3,
  dorm_building: 'Gordon',
  dorm_room: '204',
  email: 'alice@example.com',
  cell_phone: '555-1234',
  parent_first_name: 'Bob',
  parent_last_name: 'Smith',
  parent_phone: '555-9999',
  medical_notes: '',
  additional_info: '',
  created_at: '2026-01-01',
  schedule_for_date: [
    {
      session_id: 'sess-1',
      session_name: 'Band 1 Rehearsal',
      period_name: 'Period 1',
      start_time: '8:00',
      end_time: '8:50',
      location: 'Hemmle Hall',
      status: 'present',
    },
    {
      session_id: 'sess-2',
      session_name: 'Flute Sectional',
      period_name: 'Period 2',
      start_time: '9:00',
      end_time: '9:50',
      location: 'Room 102',
      status: 'absent',
    },
  ],
};

function renderModal(props: Partial<Parameters<typeof StudentDetailModal>[0]> = {}) {
  const merged = {
    studentId: 'stu-1',
    date: '2026-06-08',
    onClose: vi.fn(),
    ...props,
  };
  return render(
    <ToastProvider>
      <StudentDetailModal {...merged} />
    </ToastProvider>
  );
}

describe('StudentDetailModal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === 'string' && url.startsWith('/api/students/') && (!init || init.method === undefined || init.method === 'GET')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockStudent,
          } as Response;
        }
        if (typeof url === 'string' && init?.method === 'PUT') {
          const body = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...mockStudent, ...body }),
          } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders nothing when studentId is null', () => {
    const { container } = renderModal({ studentId: null });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches the student on open with with_schedule + date query params', async () => {
    renderModal();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    const firstCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = firstCall[0] as string;
    expect(url).toContain('/api/students/stu-1');
    expect(url).toContain('with_schedule=1');
    expect(url).toContain('date=2026-06-08');
  });

  it('renders student name and instrument from the fetch response', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Smith/).length).toBeGreaterThan(0);
    // Preferred name shown in parens (also appears in the Preferred Name field)
    expect(screen.getAllByText(/Allie/).length).toBeGreaterThan(0);
    // Instrument surfaces somewhere in the modal body
    expect(screen.getAllByText(/Flute/).length).toBeGreaterThan(0);
  });

  it('renders medical-notes yellow banner when present, and hides it when empty', async () => {
    // First: empty medical_notes => no banner
    const { unmount } = renderModal();
    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('medical-notes-banner')).toBeNull();
    unmount();

    // Replace fetch to return a student WITH medical notes
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            ...mockStudent,
            medical_notes: 'Severe peanut allergy — EpiPen in nurse office.',
          }),
        }) as Response
      )
    );
    renderModal({ studentId: 'stu-2' });
    await waitFor(() => {
      expect(screen.getByTestId('medical-notes-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('medical-notes-banner').textContent).toContain('peanut');
  });

  it("renders today's schedule with per-session status pills", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Band 1 Rehearsal')).toBeInTheDocument();
    });
    expect(screen.getByText('Flute Sectional')).toBeInTheDocument();
    // Status pills (by role/text, case-insensitive)
    expect(screen.getByText(/PRESENT/i)).toBeInTheDocument();
    expect(screen.getByText(/ABSENT/i)).toBeInTheDocument();
  });

  it('inline edit calls PUT with updated field and fires onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderModal({ onUpdate });
    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });

    // Click the cell_phone value to enter edit mode
    const phoneCell = screen.getByTestId('field-cell_phone');
    await user.click(phoneCell);

    const input = await screen.findByTestId('field-input-cell_phone');
    await user.clear(input);
    await user.type(input, '555-0000');
    // Blur commits the save
    await act(async () => {
      input.blur();
    });

    await waitFor(() => {
      const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[1]?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[1]?.method === 'PUT'
    )!;
    expect(putCall[0]).toBe('/api/students/stu-1');
    const body = JSON.parse(putCall[1].body as string);
    expect(body.cell_phone).toBe('555-0000');

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
    const arg = onUpdate.mock.calls[0][0];
    expect(arg.cell_phone).toBe('555-0000');
  });

  it('Escape key inside an edit input reverts the value without PUT', async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });

    const phoneCell = screen.getByTestId('field-cell_phone');
    await user.click(phoneCell);
    const input = await screen.findByTestId('field-input-cell_phone');
    await user.clear(input);
    await user.type(input, 'bogus');
    await user.keyboard('{Escape}');

    // No PUT should have fired
    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[1]?.method === 'PUT'
    );
    expect(putCall).toBeUndefined();
    // Original value still visible
    expect(screen.getByTestId('field-cell_phone').textContent).toContain('555-1234');
  });
});
