/**
 * FocusFlow — Google Drive Sheet Picker Modal & Integration
 *
 * Implements the Google Picker API (ViewId.SPREADSHEETS):
 * - Uses existing OAuth access token with `https://www.googleapis.com/auth/drive.file`.
 * - Uses restricted Google Cloud project `focus-flow-by-atif` Project Number (1010159085609).
 * - Uses Developer Key from `VITE_GOOGLE_PICKER_API_KEY`.
 * - Grants per-file authorization to the selected spreadsheet under `drive.file`,
 *   allowing FocusFlow to copy even private spreadsheets to the user's personal Google Drive.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderSync,
  AlertCircle,
  ExternalLink,
  Loader2,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import {
  getGhostProjectNumber,
  getGooglePickerApiKey,
  loadGooglePickerApi,
  requestGoogleDriveToken,
  type GooglePickerCallbackData,
} from '../../lib/googleAuthGis.ts';
import { ThemeButton } from '../ui/ThemePrimitives.tsx';

export interface SelectedGoogleSheet {
  id: string;
  name: string;
  url: string;
}

export interface GoogleSheetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSheet: (sheet: SelectedGoogleSheet, token?: string) => void;
  oauthToken?: string | null;
  loginHint?: string | null;
}

/**
 * Programmatically constructs and launches the Google Picker dialog.
 * Can be called directly or via GoogleSheetPickerModal.
 */
export async function launchGoogleSpreadsheetPicker(options: {
  accessToken: string;
  onSelect: (sheet: SelectedGoogleSheet, token?: string) => void;
  onCancel?: () => void;
  apiKey?: string;
  projectNumber?: string;
}): Promise<void> {
  await loadGooglePickerApi();

  if (!window.google?.picker?.PickerBuilder) {
    throw new Error('Google Picker API is not available on window.google.picker.');
  }

  const token = options.accessToken.trim();
  if (!token) {
    throw new Error('Valid Google OAuth access token is required to open Google Picker.');
  }

  const projectNumber = (options.projectNumber || getGhostProjectNumber()).trim();
  const apiKey = (options.apiKey || getGooglePickerApiKey()).trim();

  const googlePicker = window.google.picker;

  // Configure Spreadsheet view
  const view = new googlePicker.DocsView(googlePicker.ViewId.SPREADSHEETS);
  view.setMimeTypes('application/vnd.google-apps.spreadsheet');
  if (googlePicker.DocsViewMode?.LIST) {
    view.setMode(googlePicker.DocsViewMode.LIST);
  }

  // Construct PickerBuilder
  const builder = new googlePicker.PickerBuilder();

  if (googlePicker.Feature?.SUPPORT_DRIVES) {
    builder.enableFeature(googlePicker.Feature.SUPPORT_DRIVES);
  }

  builder
    .setAppId(projectNumber)
    .setOAuthToken(token)
    .setDeveloperKey(apiKey)
    .addView(view)
    .setTitle('Select Google Spreadsheet for FocusFlow')
    .setCallback((data: GooglePickerCallbackData) => {
      const action = data[googlePicker.Response?.ACTION || 'action'];

      if (action === googlePicker.Action.PICKED) {
        const docs = (data[googlePicker.Response?.DOCUMENTS || 'docs'] || []) as Array<Record<string, unknown>>;
        const pickedDoc = docs[0];
        if (pickedDoc) {
          const docId = String(
            pickedDoc[googlePicker.Document?.ID || 'id'] || pickedDoc.id || ''
          ).trim();
          const docName = String(
            pickedDoc[googlePicker.Document?.NAME || 'name'] || pickedDoc.name || 'Untitled Spreadsheet'
          ).trim();
          const docUrl = String(
            pickedDoc[googlePicker.Document?.URL || 'url'] ||
              pickedDoc.url ||
              `https://docs.google.com/spreadsheets/d/${docId}/edit`
          ).trim();

          if (docId) {
            options.onSelect(
              {
                id: docId,
                name: docName,
                url: docUrl,
              },
              token
            );
          }
        }
      } else if (action === googlePicker.Action.CANCEL) {
        options.onCancel?.();
      }
    });

  const picker = builder.build();
  picker.setVisible(true);
}

export const GoogleSheetPickerModal: React.FC<GoogleSheetPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectSheet,
  oauthToken,
  loginHint,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startPicker = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Ensure we have an authorized OAuth token with drive.file
      let token = oauthToken;
      if (!token) {
        token = await requestGoogleDriveToken({ loginHint });
      }

      if (!token) {
        throw new Error('Google Drive authorization was not completed. Please retry.');
      }

      // 2. Launch Google Picker dialog
      await launchGoogleSpreadsheetPicker({
        accessToken: token,
        onSelect: (sheet, pickerToken) => {
          setIsLoading(false);
          onSelectSheet(sheet, pickerToken || token || undefined);
          onClose();
        },
        onCancel: () => {
          setIsLoading(false);
          onClose();
        },
      });

      // Keep loading indicator until user interacts with picker or cancels
      setIsLoading(false);
    } catch (err) {
      console.warn('[GoogleSheetPickerModal] Picker launch failed:', err);
      setIsLoading(false);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not open Google Drive file picker. Check popup permissions or network connection.'
      );
    }
  }, [oauthToken, loginHint, onSelectSheet, onClose]);

  useEffect(() => {
    if (isOpen) {
      void startPicker();
    } else {
      setErrorMessage(null);
      setIsLoading(false);
    }
  }, [isOpen, startPicker]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-modal-title"
    >
      <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--ff-surface-elevated)] border border-[var(--ff-border-color)] shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-[var(--ff-accent)]" />
            <h3 id="picker-modal-title" className="font-bold text-sm text-[var(--ff-text-primary)]">
              Browse Google Drive Spreadsheets
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading && (
          <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
            <Loader2 className="w-8 h-8 text-[var(--ff-accent)] animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Opening Google Drive...
              </p>
              <p className="text-xs text-[var(--ff-text-muted)] max-w-xs">
                A Google Drive window will appear to select your spreadsheet. Selecting a sheet grants FocusFlow authorization to duplicate it.
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Unable to open Google Picker</p>
                <p className="leading-relaxed opacity-95">{errorMessage}</p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-rose-500/20">
              <ThemeButton variant="secondary" size="sm" onClick={() => void startPicker()}>
                Retry Picker
              </ThemeButton>
              <ThemeButton variant="secondary" size="sm" onClick={onClose}>
                Paste URL Manually
              </ThemeButton>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--ff-border-color)] flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]">
          <span>Project: focus-flow-by-atif (App: 1010159085609)</span>
          <a
            href="https://developers.google.com/drive/picker/guides/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline inline-flex items-center gap-0.5"
          >
            Picker Guide <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};

