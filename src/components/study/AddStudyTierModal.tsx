import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { AcademicTier } from '../../types/study.ts';

interface AddStudyTierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (tier: Partial<AcademicTier>) => Promise<void>;
}

export const AddStudyTierModal: React.FC<AddStudyTierModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [name, setName] = useState('');
  const [shortTitle, setShortTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a tier name');
      return;
    }

    const cleanName = name.trim();
    const cleanShortTitle = shortTitle.trim() || cleanName.slice(0, 20);
    const cleanId = `tier_${cleanShortTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24)}_${Date.now().toString(36)}`;

    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        id: cleanId,
        name: cleanName,
        shortTitle: cleanShortTitle,
        description: description.trim(),
        subjectCodes: [],
      });
      setName('');
      setShortTitle('');
      setDescription('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create academic tier');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Academic Tier"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Tier Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!shortTitle || shortTitle === name.slice(0, 16)) {
                setShortTitle(e.target.value.slice(0, 16));
              }
            }}
            placeholder="e.g. Semester 5 - AI & Data Science"
            className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Short Tab Label *
          </label>
          <input
            type="text"
            required
            maxLength={24}
            value={shortTitle}
            onChange={(e) => setShortTitle(e.target.value)}
            placeholder="e.g. Sem 5"
            className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
          <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
            Displayed on navigation pills and category badges.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Description (Optional)
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Core semester subjects, projects, and lab work"
            className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)] resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </ThemeButton>
          <ThemeButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creating...' : 'Create Tier'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};
