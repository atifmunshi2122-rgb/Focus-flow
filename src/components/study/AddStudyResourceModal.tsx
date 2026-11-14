import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyResource, StudyResourceType, StudySubject, StudyTopic } from '../../types/study.ts';
import { Link2, Bookmark } from 'lucide-react';

interface AddStudyResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (res: Partial<StudyResource>) => Promise<void>;
  subjects: StudySubject[];
  topics: StudyTopic[];
}

export const AddStudyResourceModal: React.FC<AddStudyResourceModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  subjects,
  topics,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<StudyResourceType>('link');
  const [url, setUrl] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [topicId, setTopicId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
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
      setError('Please enter a resource title');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const selectedSub = subjects.find((s) => s.code === subjectCode);
      await onAdd({
        title: title.trim(),
        description: description.trim(),
        resourceType,
        url: url.trim() || null,
        storagePath: null,
        subjectId: selectedSub?.id || null,
        topicId: topicId || null,
        tags,
        isBookmarked,
      });
      setTitle('');
      setDescription('');
      setUrl('');
      setTags([]);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save resource');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Add Study Resource / Material">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Material / Resource Title *
          </label>
          <div className="relative">
            <Link2 className="absolute left-3 top-2.5 w-4 h-4 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Stanford CS144 Lecture Slides / GATE PYQ PDF"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Resource Format
            </label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as StudyResourceType)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="link">Web Link / Article</option>
              <option value="pdf">PDF Document / Cheatsheet</option>
              <option value="video">Video Lecture (YouTube/NPTEL)</option>
              <option value="document">Course Docs / Markdown</option>
              <option value="image">Diagram / Mindmap Image</option>
              <option value="other">Other Reference</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              URL / Web Address
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
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
              <option value="">General (All Subjects)</option>
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Specific Topic
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="">None / Subject Level</option>
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
            Description & Key Takeaways
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this resource is helpful, which chapters to read..."
            className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
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
            placeholder="e.g. nptel, pyq_solutions, cheat_sheet"
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

        <div className="flex items-center gap-2 py-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--ff-text-primary)]">
            <input
              type="checkbox"
              checked={isBookmarked}
              onChange={(e) => setIsBookmarked(e.target.checked)}
              className="rounded text-[var(--ff-accent)]"
            />
            <Bookmark className="w-3.5 h-3.5 text-amber-400" /> Bookmark to Quick Access Library
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Resource'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};

