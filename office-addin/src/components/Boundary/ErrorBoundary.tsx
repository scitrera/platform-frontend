import React, { Component, ErrorInfo } from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Unhandled error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 text-sm text-red-700 bg-red-50 rounded-lg m-3">
            <p className="font-semibold mb-1">Something went wrong</p>
            <p className="text-xs text-red-600 font-mono break-all">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
            <button
              className="mt-2 text-xs underline text-red-600 hover:text-red-800"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
