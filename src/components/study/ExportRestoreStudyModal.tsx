import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyExportPayload } from '../../types/study.ts';
import { validateStudyExportPayload } from '../../lib/studyIntelligence.ts';
import { getTodayDateString } from '../../lib/dateTime.ts';
import { Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ExportRestoreStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportData: () => Promise<StudyExportPayload>;
  onRestore: (payload: StudyExportPayload) => Promise<void>;
}

export const ExportRestoreStudyModal: React.FC<ExportRestoreStudyModalProps> = ({
  isOpen,
  onClose,
  exportData,
  onRestore,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');
  const [jsonText, setJsonText] = useState('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    summary?: string;
    payload?: StudyExportPayload;
  } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async () => {
    setProcessing(true);
    setErrorMessage(null);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `focusflow_study_backup_${getTodayDateString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage('Study backup downloaded successfully.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleValidateJson = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const parsed = JSON.parse(jsonText);
      const validated = validateStudyExportPayload(parsed);
      if (!validated) {
        setValidationResult({ valid: false });
        setErrorMessage('Invalid Study JSON schema. Missing version or user signature.');
        return;
      }
      setValidationResult({
        valid: true,
        summary: `Validated: ${validated.subjects.length} subjects, ${validated.topics.length} topics, ${validated.goals.length} goals, ${validated.plans.length} plans, ${validated.exams.length} exams, ${validated.notes.length} notes, ${validated.flashcards.length} flashcards`,
        payload: validated,
      });
    } catch (err) {
      setValidationResult({ valid: false });
      setErrorMessage('Malformed JSON string. Please paste valid JSON.');
    }
  };

  const handleExecuteRestore = async () => {
    if (!validationResult?.valid || !validationResult.payload) return;
    setProcessing(true);
    setErrorMessage(null);
    try {
      await onRestore(validationResult.payload);
      setStatusMessage('Study workspace successfully restored!');
      setJsonText('');
      setValidationResult(null);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Restore operation failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Study Data Portability & Backup">
      <div className="space-y-4">
        <div className="flex border-b border-[var(--ff-border-color)] pb-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'export'
                ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] border border-[var(--ff-accent)]/30'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
          >
            Export Backup (JSON)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('restore');
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'restore'
                ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] border border-[var(--ff-accent)]/30'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
          >
            Restore Backup
          </button>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {activeTab === 'export' ? (
          <div className="space-y-3 py-2">
            <p className="text-xs text-[var(--ff-text-muted)] leading-relaxed">
              Export your entire academic workspace into a standardized, portable JSON format.
              Includes syllabus subjects, topics, spaced repetition revisions, mistakes, study
              plans, plan tasks, goals, milestones, notes, flashcards, and resources.
            </p>
            <div className="pt-2">
              <ThemeButton
                variant="primary"
                onClick={handleDownload}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {processing ? 'Preparing Export...' : 'Download Study Data (.json)'}
              </ThemeButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--ff-text-muted)] leading-relaxed">
              Paste your exported Study JSON below. The payload will be strictly validated against
              schema specifications before any restoration takes place.
            </p>
            <textarea
              rows={6}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setValidationResult(null);
              }}
              placeholder='Paste JSON here: { "version": 1, ... }'
              className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
            <div className="flex gap-2">
              <ThemeButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleValidateJson}
                disabled={!jsonText.trim() || processing}
              >
                Validate Schema
              </ThemeButton>

              {validationResult?.valid && (
                <ThemeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleExecuteRestore}
                  disabled={processing}
                  className="flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {processing ? 'Restoring Workspace...' : 'Confirm Restore'}
                </ThemeButton>
              )}
            </div>

            {validationResult?.valid && validationResult.summary && (
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                {validationResult.summary}
              </div>
            )}
          </div>
        )}
      </div>
    </ThemeModal>
  );
};

