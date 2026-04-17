// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/Modal';

describe('Modal', () => {
  it('renders with role=dialog and aria-modal=true', () => {
    render(
      <Modal open onClose={() => {}} title="T">
        <p>body</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('T');
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="T">
        hi
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('focuses first focusable element on open', () => {
    render(
      <Modal open onClose={() => {}} title="T">
        <button>first</button>
        <button>second</button>
      </Modal>
    );
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('returns null when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="T">
        hi
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
