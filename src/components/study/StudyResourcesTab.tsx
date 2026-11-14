import React, { useState } from 'react';
import { StudyResource, StudyResourceType, StudySubject } from '../../types/study.ts';
import { ThemeCard, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { Link2, Plus, Trash2, Bookmark, ExternalLink, FileText, Video, Book, Globe } from 'lucide-react';

interface StudyResourcesTabProps {
  resources: StudyResource[];
  subjects: StudySubject[];
  onOpenAddResource: () => void;
  onToggleBookmark: (resource: StudyResource) => Promise<void>;
  onDeleteResource: (resId: string) => Promise<void>;
}

export const StudyResourcesTab: React.FC<StudyResourcesTabProps> = ({
  resources,
  subjects,
  onOpenAddResource,
  onToggleBookmark,
  onDeleteResource,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');

  const activeResources = resources.filter((r) => {
    if (r.deletedAt) return false;
    if (filterType !== 'all' && r.resourceType !== filterType) return false;
    if (filterSubject !== 'all' && r.subjectId !== filterSubject) return false;
    return true;
  });

  const getFormatIcon = (type: StudyResourceType) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4 text-rose-400" />;
      case 'pdf':
      case 'document':
        return <FileText className="w-4 h-4 text-amber-400" />;
      case 'other':
      case 'image':
        return <Book className="w-4 h-4 text-emerald-400" />;
      default:
        return <Globe className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Curated Study Resources & Materials
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Store video lecture links, PDF drive links, documentation, and textbooks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
          >
            <option value="all">All Formats</option>
            <option value="link">Web Links</option>
            <option value="video">Videos</option>
            <option value="pdf">PDF Documents</option>
            <option value="document">Documents</option>
          </select>

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

          <ThemeButton variant="primary" size="sm" onClick={onOpenAddResource}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Resource
          </ThemeButton>
        </div>
      </div>

      {/* Resources Grid */}
      {activeResources.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <Link2 className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No study materials stored yet.</p>
          <p>Add YouTube playlists, MIT OpenCourseWare links, or textbook PDFs.</p>
          <ThemeButton variant="secondary" size="sm" onClick={onOpenAddResource}>
            Add Material Link
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeResources.map((res) => (
            <ThemeCard key={res.id} className="p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {getFormatIcon(res.resourceType)}
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)]">
                      {res.resourceType}
                    </span>
                    {res.subjectId && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)] font-bold">
                        {res.subjectId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleBookmark(res)}
                      className={`p-1 ${res.isBookmarked ? 'text-amber-400' : 'text-[var(--ff-text-muted)] hover:text-amber-400'}`}
                      title={res.isBookmarked ? 'Bookmarked' : 'Add Bookmark'}
                    >
                      <Bookmark className="w-3.5 h-3.5" fill={res.isBookmarked ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteResource(res.id)}
                      className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  {res.title}
                </h4>
                {res.description && (
                  <p className="text-xs text-[var(--ff-text-muted)] mt-1 line-clamp-2">
                    {res.description}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--ff-border-color)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--ff-text-muted)] truncate max-w-[200px]">
                  {res.url || 'No URL'}
                </span>
                {res.url && (
                  <ThemeButton
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(res.url!, '_blank', 'noopener,noreferrer')}
                    className="h-7 text-xs text-[var(--ff-accent-text)] hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3 ml-1" />
                  </ThemeButton>
                )}
              </div>
            </ThemeCard>
          ))}
        </div>
      )}
    </div>
  );
};
