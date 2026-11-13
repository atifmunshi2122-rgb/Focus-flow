import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { COMPLETE_THEME_COLLECTION, PresetTheme } from '../../theme/presetThemes.ts';
import { ThemeConfig } from '../../types/theme.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  Check,
  Eye,
  Filter,
  Flame,
  Layers,
  Palette,
  Search,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react';

interface SignatureThemeCollectionProps {
  currentConfig: ThemeConfig;
  draftConfig: ThemeConfig;
  onSelectTheme: (theme: PresetTheme) => void;
  onApplyDirectly: (theme: PresetTheme) => void;
  favoriteThemeIds: string[];
  onToggleFavorite: (themeId: string) => void;
}

const CATEGORY_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All 20 Themes' },
  { id: 'Modern & Glass', label: 'Modern & Glass' },
  { id: '3D & Tactile', label: '3D & Tactile' },
  { id: 'Dark & Neon', label: 'Dark & Neon' },
  { id: 'Nature & Gradient', label: 'Nature & Gradient' },
  { id: 'Clean & Minimal', label: 'Clean & Minimal' },
];

export const SignatureThemeCollection: React.FC<SignatureThemeCollectionProps> = ({
  currentConfig,
  draftConfig,
  onSelectTheme,
  onApplyDirectly,
  favoriteThemeIds,
  onToggleFavorite,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);

  const filteredThemes = useMemo(() => {
    return COMPLETE_THEME_COLLECTION.filter((theme) => {
      if (selectedCategory !== 'all' && theme.category !== selectedCategory) {
        return false;
      }
      if (favoritesOnly && !favoriteThemeIds.includes(theme.id)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${theme.name} ${theme.tagline} ${theme.description} ${theme.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [selectedCategory, searchQuery, favoritesOnly, favoriteThemeIds]);

  return (
    <div className="space-y-5">
      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] rounded-2xl shadow-xs">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {CATEGORY_TABS.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 ${
                  isSelected
                    ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-xs'
                    : 'bg-[var(--ff-surface-subtle)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search & Favorites Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--ff-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 20 themes..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] rounded-xl focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setFavoritesOnly((prev) => !prev)}
            className={`p-2 rounded-xl border transition-colors ${
              favoritesOnly
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-500'
                : 'bg-[var(--ff-surface-subtle)] border-[var(--ff-border-color)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
            title="Filter favorite themes"
          >
            <Star className={`w-4 h-4 ${favoritesOnly ? 'fill-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredThemes.map((theme) => {
          const isFavorited = favoriteThemeIds.includes(theme.id);
          // Check if currently drafted or active
          const isDrafted = draftConfig.styleId === theme.config.styleId &&
            (!theme.config.accentColor || draftConfig.accentColor === theme.config.accentColor);
          const isLiveActive = currentConfig.styleId === theme.config.styleId &&
            (!theme.config.accentColor || currentConfig.accentColor === theme.config.accentColor);

          return (
            <ThemeCard
              key={theme.id}
              variant="interactive"
              className={`p-4 flex flex-col justify-between relative overflow-hidden group transition-all border-2 ${
                isDrafted
                  ? 'border-[var(--ff-accent)] shadow-md'
                  : 'border-[var(--ff-border-color)] hover:border-[var(--ff-accent-border)]'
              }`}
            >
              <div>
                {/* Header: Category Badge & Favorite Star */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--ff-surface-subtle)] text-[var(--ff-text-secondary)] border border-[var(--ff-border-color)]">
                    {theme.category}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {isLiveActive && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        Live
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(theme.id);
                      }}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-amber-500 transition-colors"
                      title={isFavorited ? 'Remove from favorites' : 'Mark as favorite'}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFavorited ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Theme Name & Tagline */}
                <h3 className="font-bold text-base text-[var(--ff-text-primary)] group-hover:text-[var(--ff-accent-text)] transition-colors">
                  {theme.name}
                </h3>
                <p className="text-xs font-medium text-[var(--ff-text-muted)] mt-0.5">
                  {theme.tagline}
                </p>

                {/* 4-Color Palette Swatch Strip */}
                <div className="flex items-center gap-1.5 my-3 p-1.5 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]/60">
                  {theme.previewColors.map((color, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-6 rounded-lg border border-white/20 shadow-xs"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>

                <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-2 leading-relaxed">
                  {theme.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[var(--ff-border-color)]/50">
                <button
                  type="button"
                  onClick={() => onSelectTheme(theme)}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                    isDrafted
                      ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] border-[var(--ff-accent-border)]'
                      : 'bg-[var(--ff-surface-subtle)] text-[var(--ff-text-primary)] border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isDrafted ? 'Previewing' : 'Preview'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onApplyDirectly(theme)}
                  className="py-1.5 px-3 text-xs font-bold rounded-xl bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0"
                  title="Apply this theme globally now"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply</span>
                </button>
              </div>
            </ThemeCard>
          );
        })}
      </div>

      {filteredThemes.length === 0 && (
        <div className="p-8 text-center text-xs text-[var(--ff-text-muted)] bg-[var(--ff-surface-card)] rounded-2xl border border-[var(--ff-border-color)]">
          No themes match your search query. Try adjusting filters or searching a different term.
        </div>
      )}
    </div>
  );
};
