import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { AuthDiagnostic, getCurrentAppUrl } from '../../lib/authDiagnostics.ts';
import { ThemeBadge, ThemeButton, ThemeModal } from '../ui/ThemePrimitives.tsx';

interface AuthRecoveryModalProps {
  diagnostic: AuthDiagnostic | null;
  isRetrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export const AuthRecoveryModal: React.FC<AuthRecoveryModalProps> = ({
  diagnostic,
  isRetrying,
  onRetry,
  onClose,
}) => {
  const [copiedDomain, setCopiedDomain] = useState(false);

  if (!diagnostic) return null;

  const currentUrl = getCurrentAppUrl() || '#';
  const isDomainError = diagnostic.code === 'auth/unauthorized-domain';

  const handleCopyDomain = async () => {
    if (!diagnostic.hostname) return;
    try {
      await navigator.clipboard.writeText(diagnostic.hostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 1800);
    } catch {
      // Clipboard API may be blocked in restricted frames
    }
  };

  return (
    <ThemeModal
      isOpen={!!diagnostic}
      onClose={onClose}
      title={diagnostic.title}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 shrink-0 flex items-center justify-center"
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: isDomainError ? 'var(--ff-danger-soft)' : 'var(--ff-warning-soft)',
              color: isDomainError ? 'var(--ff-danger)' : 'var(--ff-warning)',
            }}
          >
            {isDomainError ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs leading-relaxed text-[var(--ff-text-secondary)]">
              {diagnostic.summary}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <ThemeBadge tone={isDomainError ? 'danger' : 'warning'}>
                {diagnostic.code}
              </ThemeBadge>
              <ThemeBadge tone="neutral">
                {diagnostic.scopeMode === 'sheets'
                  ? 'Google Sheets & Drive OAuth'
                  : 'Basic Google Sign-In'}
              </ThemeBadge>
              <ThemeBadge tone={diagnostic.isIframe ? 'warning' : 'neutral'}>
                {diagnostic.isIframe ? 'Embedded Preview Frame' : 'Direct Browser Tab'}
              </ThemeBadge>
            </div>
          </div>
        </div>

        {/* Resolution Guidance Box */}
        <div
          className="p-3.5 text-xs space-y-2 border"
          style={{
            borderRadius: 'var(--ff-radius-card)',
            background: 'var(--ff-surface-inset)',
            borderColor: 'var(--ff-border-color)',
          }}
        >
          <span className="font-bold text-[var(--ff-text-primary)] block">
            How to fix this
          </span>
          <p className="text-[var(--ff-text-secondary)] leading-relaxed">
            {diagnostic.resolutionHint}
          </p>
          {diagnostic.hostname && (
            <div className="pt-1.5 border-t border-[var(--ff-border-color)] flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-[var(--ff-text-muted)] truncate">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">{diagnostic.hostname}</span>
              </span>
              {diagnostic.shouldOfferCopyDomain && (
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="inline-flex items-center gap-1 px-2 py-1 font-semibold border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-primary)] shrink-0 transition-colors"
                  style={{ borderRadius: 'var(--ff-radius-button)' }}
                >
                  {copiedDomain ? (
                    <>
                      <Check className="w-3 h-3" style={{ color: 'var(--ff-success)' }} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Domain</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recovery Actions */}
        <div className="pt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" size="sm" onClick={onClose}>
            Continue in Local Mode
          </ThemeButton>

          {diagnostic.canRetry && (
            <ThemeButton
              type="button"
              variant={diagnostic.shouldOfferNewTab ? 'secondary' : 'primary'}
              size="sm"
              loading={isRetrying}
              loadingText="Opening Google..."
              onClick={onRetry}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {diagnostic.scopeMode === 'sheets' ? 'Retry Sheets Access' : 'Retry Sign-In'}
              </span>
            </ThemeButton>
          )}

          {diagnostic.shouldOfferNewTab && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ff-btn ff-btn-primary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              <span>Open App in New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </ThemeModal>
  );
};
