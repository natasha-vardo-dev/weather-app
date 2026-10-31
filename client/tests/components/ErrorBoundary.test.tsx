import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { renderWithApp } from './render';

function Broken({ broken }: { broken: boolean }) {
  if (broken) throw new Error('render failed');
  return <p>Forecast</p>;
}

describe('ErrorBoundary', () => {
  // React logs the error it caught; that is expected here.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('shows the fallback instead of a blank page, and renders again on another page', () => {
    const view = renderWithApp(
      <ErrorBoundary resetKey="/weather/a" fallback={<p role="alert">Something went wrong</p>}>
        <Broken broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');

    // The same page: the fallback stays (the cause is still there).
    view.rerender(
      <ErrorBoundary resetKey="/weather/a" fallback={<p role="alert">Something went wrong</p>}>
        <Broken broken={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Another page: its content gets another try.
    view.rerender(
      <ErrorBoundary resetKey="/weather/b" fallback={<p role="alert">Something went wrong</p>}>
        <Broken broken={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
