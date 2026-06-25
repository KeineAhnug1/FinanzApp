import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { toast, ToastContainer } from '../Toast';

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no toasts have been emitted', () => {
    render(<ToastContainer />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a toast emitted via toast() with role="status"', () => {
    render(<ToastContainer />);
    act(() => {
      toast('Hello world');
    });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Hello world');
  });

  it('exposes an aria-live polite region for assistive tech', () => {
    render(<ToastContainer />);
    act(() => {
      toast.success('Saved');
    });
    const region = screen.getByRole('status').parentElement;
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('applies a type-specific class for severity styling', () => {
    render(<ToastContainer />);
    act(() => {
      toast.error('Boom');
    });
    expect(screen.getByRole('status')).toHaveClass('toast-error');
  });

  it('auto-dismisses the toast after the timeout', () => {
    render(<ToastContainer />);
    act(() => {
      toast('Bye');
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
