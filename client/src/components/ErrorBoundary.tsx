import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
  /** When it changes (another page), the children get another try. */
  resetKey?: string;
}

interface State {
  failed: boolean;
  /** The resetKey the failure happened at. */
  failedAt?: string;
}

/**
 * Shows `fallback` instead of a blank page when a render throws below it. Reporting is not
 * here: React passes caught errors to createRoot's onCaughtError (main.tsx), which sends them.
 * A class component: React has no hook for this.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Failed on one page, the next page renders again; on the same page the fallback stays.
    if (!state.failed) return { failedAt: props.resetKey };
    if (state.failedAt !== props.resetKey) return { failed: false, failedAt: props.resetKey };
    return null;
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
