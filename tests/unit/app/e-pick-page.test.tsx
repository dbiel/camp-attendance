// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useParams: () => ({ token: 'tok' }) }));

import EnsemblePickerPage from '@/app/e/pick/[token]/page';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('EnsemblePickerPage', () => {
  it('renders a button per resolved ensemble linking to /e/<token>', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ ensemble: 'Band 1', token: 'b1', count: 73 }, { ensemble: 'Orchestra 1', token: 'o1', count: 37 }] }),
    });
    render(<EnsemblePickerPage />);
    await waitFor(() => expect(screen.getByText('Band 1')).toBeTruthy());
    const band = screen.getByText('Band 1').closest('a') as HTMLAnchorElement;
    expect(band.getAttribute('href')).toBe('/e/b1');
    expect(screen.getByText('Orchestra 1').closest('a')!.getAttribute('href')).toBe('/e/o1');
  });
  it('shows the inactive screen on an invalid token', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<EnsemblePickerPage />);
    await waitFor(() => expect(screen.getByText('This link is no longer active')).toBeTruthy());
  });
});
