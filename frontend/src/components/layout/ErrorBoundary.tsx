import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorState } from '../ui/ErrorState';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error in UI component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 max-w-xl mx-auto my-12">
          <ErrorState
            title="Application Error"
            message={
              this.state.error?.message ||
              'A rendering error occurred in the application.'
            }
            onRetry={this.handleReset}
            retryLabel="Reload Component"
          />
        </div>
      );
    }

    return this.props.children;
  }
}

