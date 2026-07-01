// @vitest-environment jsdom
import { useState } from 'react';
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

  it('does not steal focus back to the first field when a parent re-render passes a new onClose (e.g. typing in a later field)', async () => {
    // Mirrors StudentsDataPage: a plain (non-memoized) closeModal recreated on
    // every render, which happens on every keystroke of a controlled form.
    function Harness() {
      const [, setTick] = useState(0);
      return (
        <Modal open onClose={() => setTick((t) => t + 1)} title="T">
          <input aria-label="first" />
          <input
            aria-label="second"
            onChange={() => setTick((t) => t + 1)}
          />
        </Modal>
      );
    }
    render(<Harness />);
    const second = screen.getByLabelText('second');
    second.focus();
    await userEvent.type(second, 'ab');
    expect(second).toHaveFocus();
    expect(second).toHaveValue('ab');
  });
});
