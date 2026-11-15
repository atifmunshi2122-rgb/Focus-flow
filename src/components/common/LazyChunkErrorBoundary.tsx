import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_AUTO_RETRIES = 1;
const RETRY_STORAGE_KEY = 'ff_lazy_chunk_retry_v1';

export class LazyChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[LazyChunkErrorBoundary] Caught chunk loading error:', error, errorInfo);

    // Check if error is related to dynamic import / chunk failure
    const isChunkFailure =
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Loading chunk') ||
      error.name === 'ChunkLoadError';

    if (isChunkFailure) {
      try {
        const lastRetry = sessionStorage.getItem(RETRY_STORAGE_KEY);
        const retryCount = lastRetry ? parseInt(lastRetry, 10) : 0;

        if (retryCount < MAX_AUTO_RETRIES) {
          sessionStorage.setItem(RETRY_STORAGE_KEY, String(retryCount + 1));
          // Perform a one-time automatic page reload to fetch new deployment chunks
          window.location.reload();
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }

  handleManualRetry = (): void => {
    try {
      sessionStorage.removeItem(RETRY_STORAGE_KEY);
    } catch {
      // Ignore
    }
    this.setState({ hasError: false, error: null, retryCount: 0 });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleHardRefresh = (): void => {
    try {
      sessionStorage.removeItem(RETRY_STORAGE_KEY);
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="flex items-center justify-center min-h-[360px] p-4 w-full">
          <ThemeCard
            variant="3d"
            className="max-w-md w-full p-6 text-center space-y-4 border border-[var(--ff-danger)]/30"
          >
            <div
              className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
              style={{
                backgroundColor: 'var(--ff-danger-soft)',
                color: 'var(--ff-danger)',
              }}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                {this.props.fallbackTitle || 'Unable to Load View'}
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)] leading-relaxed">
                {isChunkError
                  ? 'A new version of FocusFlow may have been deployed or network connectivity was temporarily interrupted.'
                  : 'An unexpected rendering error occurred while activating this module.'}
              </p>
            </div>

            {this.state.error && (
              <div className="p-2.5 rounded-lg bg-[var(--ff-surface-subtle)] text-[11px] font-mono text-[var(--ff-text-muted)] truncate text-left border ff-divider">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={this.handleManualRetry}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry View</span>
              </ThemeButton>

              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={this.handleHardRefresh}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </ThemeButton>
            </div>
          </ThemeCard>
        </div>
      );
    }

    return this.props.children;
  }
}

