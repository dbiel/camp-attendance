// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddTimelineNote } from '@/app/admin/cases/[id]/AddTimelineNote';

describe('AddTimelineNote', () => {
  it('disables the button when empty and enables when there is text', () => {
    render(<AddTimelineNote onSubmit={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /add to timeline/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), { target: { value: 'called mom' } });
    expect(btn).toBeEnabled();
  });

  it('calls onSubmit with the trimmed body and clears the box', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddTimelineNote onSubmit={onSubmit} />);
    const box = screen.getByPlaceholderText(/add a note/i) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '  found in dorm  ' } });
    fireEvent.click(screen.getByRole('button', { name: /add to timeline/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('found in dorm'));
    await waitFor(() => expect(box.value).toBe(''));
  });
});
