import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>Body content</p>
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  it('renders the title and children when open', () => {
    render(
      <Modal open onClose={() => {}} title="Test Title">
        <p>Body content</p>
      </Modal>
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('exposes role="dialog" with aria-modal="true" and aria-labelledby pointing to the title heading', () => {
    render(
      <Modal open onClose={() => {}} title="Accessible">
        <div />
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).not.toHaveAttribute('aria-label');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy as string);
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe('Accessible');
    expect(heading?.tagName).toBe('H2');
  });

  it('falls back to aria-label when no title is provided', () => {
    render(
      <Modal open onClose={() => {}}>
        <button type="button">inside</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-label');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <div />
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <div />
      </Modal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not register the Escape listener when closed', () => {
    const onClose = vi.fn();
    render(
      <Modal open={false} onClose={onClose} title="X">
        <div />
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus into the modal on open (first focusable element)', () => {
    render(
      <Modal open onClose={() => {}} title="Focus Init">
        <button type="button">First inside</button>
        <button type="button">Second inside</button>
      </Modal>
    );
    const closeBtn = screen.getByRole('button', { name: 'Schließen' });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('focuses the dialog when no focusable content exists', () => {
    render(
      <Modal open onClose={() => {}}>
        <p>nothing to focus</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
  });

  it('wraps focus from the last element back to the first on Tab', () => {
    render(
      <Modal open onClose={() => {}} title="Trap">
        <button type="button">A</button>
        <button type="button">B</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: 'Schließen' });
    const last = screen.getByRole('button', { name: 'B' });
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('wraps focus from the first element back to the last on Shift+Tab', () => {
    render(
      <Modal open onClose={() => {}} title="Trap">
        <button type="button">A</button>
        <button type="button">B</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: 'Schließen' });
    const last = screen.getByRole('button', { name: 'B' });
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('returns focus to the previously focused element on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'opener';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Modal open onClose={() => {}} title="Return">
        <button type="button">inside</button>
      </Modal>
    );
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
