import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyNote, StudySubject, StudyTopic } from '../../types/study.ts';
import { FileText, Bookmark, Pin } from 'lucide-react';

interface AddStudyNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (note: Partial<StudyNote>) => Promise<void>;
  subjects: StudySubject[];
  topics: StudyTopic[];
  initialSubjectCode?: string;
  initialTopicId?: string;
}

export const AddStudyNoteModal: React.FC<AddStudyNoteModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  subjects,
  topics,
  initialSubjectCode,
  initialTopicId,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subjectCode, setSubjectCode] = useState(initialSubjectCode || subjects[0]?.code || '');
  const [topicId, setTopicId] = useState(initialTopicId || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTopics = topics.filter((t) => !subjectCode || t.subjectCode === subjectCode);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/^#/, '');
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tToRemove: string) => {
    setTags(tags.filter((t) => t !== tToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a note title');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const selectedSub = subjects.find((s) => s.code === subjectCode);
      await onAdd({
        title: title.trim(),
        content: content.trim(),
        subjectId: selectedSub?.id || null,
        topicId: topicId || null,
        tags,
        isPinned,
        isBookmarked,
      });
      setTitle('');
      setContent('');
      setTags([]);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Create Study Note">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Note Title *
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-2.5 w-4 h-4 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. B+ Tree Node Splitting Proof Summary"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Subject
            </label>
            <select
              value={subjectCode}
              onChange={(e) => {
                setSubjectCode(e.target.value);
                setTopicId('');
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="">General (No Subject)</option>
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Associated Topic
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="">None / Chapter Level</option>
              {availableTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subtopic}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Note Content & Derivations
          </label>
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write key equations, derivations, memory tricks, or code snippets..."
            className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Tags (press Enter to add)
          </label>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="e.g. proof, formula, high_weightage"
            className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none mb-1.5"
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)] border border-[var(--ff-border-color)]"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-red-400 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 py-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--ff-text-primary)]">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded text-[var(--ff-accent)]"
            />
            <Pin className="w-3.5 h-3.5 text-amber-400" /> Pin to top
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--ff-text-primary)]">
            <input
              type="checkbox"
              checked={isBookmarked}
              onChange={(e) => setIsBookmarked(e.target.checked)}
              className="rounded text-[var(--ff-accent)]"
            />
            <Bookmark className="w-3.5 h-3.5 text-indigo-400" /> Bookmark note
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Note'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};

