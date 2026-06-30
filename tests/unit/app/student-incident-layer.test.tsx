// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentIncidentLayer } from '@/app/e/[token]/StudentIncidentLayer';

const incident = {
  first_name: 'Jane', last_initial: 'D.', instrument: 'Flute',
  report_summary: 'Absent from Band 5', status: 'active', resolution_note: null,
  timeline: [
    { kind: 'report', label: 'Reported', body: 'Absent from Band 5', actor: 'Band 5', created_at: '2026-06-29T18:00:00Z' },
    { kind: 'update', label: 'Update', body: 'checking dorm', actor: 'Camp office', created_at: '2026-06-29T18:05:00Z' },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (opts?.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'ok' }) } as any;
    return { ok: true, status: 200, json: async () => ({ incident }) } as any;
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('StudentIncidentLayer', () => {
  it('loads and shows the incident timeline', async () => {
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Absent from Band 5')).toBeInTheDocument());
    expect(screen.getByText('checking dorm')).toBeInTheDocument();
  });

  it('posts an update and clears the box', async () => {
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Absent from Band 5'));
    const box = screen.getByPlaceholderText(/add an update/i) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'in the hall' } });
    fireEvent.click(screen.getByRole('button', { name: /send update/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/e/t/incident/1/update',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('shows the resolution in the timeline for a resolved report', async () => {
    (global.fetch as any) = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ incident: {
        first_name: 'Jane', last_initial: 'D.', instrument: 'Flute',
        report_summary: 'Absent from Band 5', status: 'resolved',
        resolution_note: 'found in dorm',
        timeline: [
          { kind: 'report', label: 'Reported', body: 'Absent from Band 5', actor: 'Band 5', created_at: '2026-06-29T18:00:00Z' },
          { kind: 'resolved', label: 'Resolved', body: 'found in dorm', actor: 'Camp office', created_at: '2026-06-29T18:10:00Z' },
        ],
      } }),
    }));
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/found in dorm/)).toBeInTheDocument());
    // update box hidden on a resolved report
    expect(screen.queryByPlaceholderText(/add an update/i)).toBeNull();
  });

  it('Back button closes the layer (history.back) instead of leaving the page', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Absent from Band 5'));
    // pushes a history entry on open so phone/browser Back is captured
    expect(pushSpy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(backSpy).toHaveBeenCalled();
  });
});
