import React, { useState } from 'react';
import { StudyNote, StudySubject } from '../../types/study.ts';
import { ThemeCard, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { FileText, Plus, Trash2, Pin, Bookmark, Search } from 'lucide-react';

interface StudyNotesTabProps {
  notes: StudyNote[];
  subjects: StudySubject[];
  onOpenAddNote: () => void;
  onTogglePin: (note: StudyNote) => Promise<void>;
  onToggleBookmark: (note: StudyNote) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

export const StudyNotesTab: React.FC<StudyNotesTabProps> = ({
  notes,
  subjects,
  onOpenAddNote,
  onTogglePin,
  onToggleBookmark,
  onDeleteNote,
}) => {
  const [filterSubject, setFilterSubject] = useState('all');
  const [search, setSearch] = useState('');

  const activeNotes = notes.filter((n) => {
    if (n.deletedAt) return false;
    if (filterSubject !== 'all' && n.subjectId !== filterSubject) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchContent = n.content.toLowerCase().includes(q);
      const matchTag = (n.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchTag) return false;
    }
    return true;
  });

  const pinnedNotes = activeNotes.filter((n) => n.isPinned);
  const otherNotes = activeNotes.filter((n) => !n.isPinned);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Study Notes & Topic Summaries
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Capture formulas, key proofs, cheat sheets, and structured Markdown notes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none w-40"
            />
          </div>

          <ThemeButton variant="primary" size="sm" onClick={onOpenAddNote}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Note
          </ThemeButton>
        </div>
      </div>

      {/* Pinned Notes Section */}
      {pinnedNotes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5" />
            Pinned Notes ({pinnedNotes.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pinnedNotes.map((note) => (
              <ThemeCard key={note.id} className="p-4 border-amber-500/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)]">
                      {note.subjectId || 'General'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onTogglePin(note)}
                        className="p-1 text-amber-400 hover:text-[var(--ff-text-muted)]"
                        title="Unpin note"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(note)}
                        className={`p-1 ${note.isBookmarked ? 'text-amber-400' : 'text-[var(--ff-text-muted)] hover:text-amber-400'}`}
                      >
                        <Bookmark className="w-3.5 h-3.5" fill={note.isBookmarked ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-[var(--ff-text-primary)] mb-1">
                    {note.title}
                  </h4>
                  <p className="text-xs text-[var(--ff-text-muted)] whitespace-pre-wrap line-clamp-4 leading-relaxed font-sans">
                    {note.content}
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-[var(--ff-border-color)] flex flex-wrap gap-1">
                  {(note.tags || []).map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                      #{tag}
                    </span>
                  ))}
                </div>
              </ThemeCard>
            ))}
          </div>
        </div>
      )}

      {/* Other Notes Section */}
      {otherNotes.length === 0 && pinnedNotes.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <FileText className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No notes recorded yet.</p>
          <p>Record chapter formulas, theorem derivations, or quick concept summaries.</p>
          <ThemeButton variant="secondary" size="sm" onClick={onOpenAddNote}>
            Write a Note
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherNotes.map((note) => (
            <ThemeCard key={note.id} className="p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)]">
                    {note.subjectId || 'General'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTogglePin(note)}
                      className="p-1 text-[var(--ff-text-muted)] hover:text-amber-400"
                      title="Pin note"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleBookmark(note)}
                      className={`p-1 ${note.isBookmarked ? 'text-amber-400' : 'text-[var(--ff-text-muted)] hover:text-amber-400'}`}
                    >
                      <Bookmark className="w-3.5 h-3.5" fill={note.isBookmarked ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNote(note.id)}
                      className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="text-sm font-bold text-[var(--ff-text-primary)] mb-1">
                  {note.title}
                </h4>
                <p className="text-xs text-[var(--ff-text-muted)] whitespace-pre-wrap line-clamp-4 leading-relaxed font-sans">
                  {note.content}
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-[var(--ff-border-color)] flex flex-wrap gap-1">
                {(note.tags || []).map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                    #{tag}
                  </span>
                ))}
              </div>
            </ThemeCard>
          ))}
        </div>
      )}
    </div>
  );
};
