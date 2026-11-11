import React, { useState, useMemo, useCallback } from 'react';
import {
  ColorPaletteCategory,
  CuratedPalette,
  GradientConfig,
  GradientStop,
  GradientType,
  HarmonyType,
  PaletteTokens,
  ThemeConfig,
  ThreeDLightingConfig,
} from '../../types/theme.ts';
import {
  CURATED_PALETTES,
  PALETTE_CATEGORIES,
  CATEGORY_METADATA,
} from '../../theme/palettes100.ts';
import {
  generateHarmonicPalette,
  generateFullThemeFromColor,
  generateRandomHarmonicPalette,
  getContrastRatio,
  getWcagRating,
  ensureAccessibleContrast,
  generateAiPaletteSuggestions,
} from '../../theme/colorHarmonyEngine.ts';
import {
  generateGradientCss,
  GRADIENT_PRESET_TEMPLATES,
  GRADIENT_TYPE_LABELS,
} from '../../theme/gradientEngine.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
} from '../ui/ThemePrimitives.tsx';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Layers,
  Lightbulb,
  Maximize2,
  Minus,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Wand2,
  Zap,
} from 'lucide-react';

const FAVORITES_STORAGE_KEY = 'ff_fav_palettes_v1';

function getStoredFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredFavorites(favs: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favs));
  } catch {
    // ignore
  }
}

interface ColorEcosystemStudioProps {
  draftConfig: ThemeConfig;
  updateDraft: (patch: Partial<ThemeConfig>) => void;
  onApplyConfig: (config: ThemeConfig) => Promise<void>;
  isFullAppPreview: boolean;
  startFullAppPreview: (config: ThemeConfig) => void;
  stopFullAppPreview: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const ColorEcosystemStudio: React.FC<ColorEcosystemStudioProps> = ({
  draftConfig,
  updateDraft,
  onApplyConfig,
  isFullAppPreview,
  startFullAppPreview,
  stopFullAppPreview,
  showToast,
}) => {
  // Navigation sub-tab inside Color Ecosystem
  const [activeSubTab, setActiveSubTab] = useState<'library' | 'harmony' | '3d-gradient'>('library');

  // Favorites state
  const [favoriteIds, setFavoriteIds] = useState<string[]>(getStoredFavorites);
  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setStoredFavorites(next);
      return next;
    });
  };

  // ==========================================
  // SECTION 1: 100+ PALETTES LIBRARY STATE
  // ==========================================
  const [selectedCategory, setSelectedCategory] = useState<ColorPaletteCategory | 'all' | 'favorites'>('all');
  const [paletteSearch, setPaletteSearch] = useState('');

  const filteredPalettes = useMemo(() => {
    const query = paletteSearch.trim().toLowerCase();
    return CURATED_PALETTES.filter((p) => {
      if (selectedCategory === 'favorites') {
        if (!favoriteIds.includes(p.id)) return false;
      } else if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }

      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.tags.some((t) => t.toLowerCase().includes(query)) ||
        p.tokens.accent.toLowerCase().includes(query)
      );
    });
  }, [selectedCategory, paletteSearch, favoriteIds]);

  const handleApplyPalette = async (palette: CuratedPalette) => {
    const next: ThemeConfig = {
      ...draftConfig,
      activePaletteId: palette.id,
      customPalette: null, // clear custom override
      accentColor: palette.tokens.accent,
      secondaryAccentColor: palette.tokens.secondary,
      threeDLighting: {
        ...(draftConfig.threeDLighting || {}),
        ambientLightColor: palette.tokens.ambientLight,
        shadowColor: palette.tokens.shadowTint,
        glassTint: palette.tokens.glassTint,
        glowColor: palette.tokens.borderGlow,
        highlightColor: palette.tokens.highlight,
      },
    };
    updateDraft(next);
    await onApplyConfig(next);
    showToast(`Applied "${palette.name}" palette across all modules`, 'success');
  };

  const handlePreviewPalette = (palette: CuratedPalette) => {
    const next: ThemeConfig = {
      ...draftConfig,
      activePaletteId: palette.id,
      customPalette: null,
      accentColor: palette.tokens.accent,
      secondaryAccentColor: palette.tokens.secondary,
      threeDLighting: {
        ...(draftConfig.threeDLighting || {}),
        ambientLightColor: palette.tokens.ambientLight,
        shadowColor: palette.tokens.shadowTint,
        glassTint: palette.tokens.glassTint,
        glowColor: palette.tokens.borderGlow,
        highlightColor: palette.tokens.highlight,
      },
    };
    updateDraft(next);
    startFullAppPreview(next);
    showToast(`Previewing "${palette.name}" (Live App Backdrop & Surfaces)`, 'info');
  };

  const handleSurpriseMePalette = () => {
    const random = CURATED_PALETTES[Math.floor(Math.random() * CURATED_PALETTES.length)];
    handlePreviewPalette(random);
  };

  // ==========================================
  // SECTION 2: HARMONY & GENERATOR STATE
  // ==========================================
  const [seedColor, setSeedColor] = useState<string>('#6366f1');
  const [harmonyType, setHarmonyType] = useState<HarmonyType>('triadic');
  const [harmonyMode, setHarmonyMode] = useState<'light' | 'dark'>('dark');
  const [customPaletteName, setCustomPaletteName] = useState<string>('My Harmonic Palette');

  // Generated tokens from harmony algorithm
  const generatedHarmonyTokens = useMemo(() => {
    const isDark = harmonyMode === 'dark';
    const pal = generateFullThemeFromColor(seedColor, isDark, customPaletteName);
    const harmonicColors = generateHarmonicPalette(seedColor, harmonyType);
    return {
      ...pal.tokens,
      accent: harmonicColors[0] || seedColor,
      secondary: harmonicColors[1] || pal.tokens.secondary,
    };
  }, [seedColor, harmonyType, harmonyMode, customPaletteName]);

  // Editable tokens for the custom builder
  const [editableTokens, setEditableTokens] = useState<PaletteTokens>(generatedHarmonyTokens);

  // Sync editable tokens when seed or harmony type changes
  React.useEffect(() => {
    setEditableTokens(generatedHarmonyTokens);
  }, [generatedHarmonyTokens]);

  const handleTokenChange = (key: keyof PaletteTokens, value: string) => {
    setEditableTokens((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Contrast measurements for accessibility validation
  const textContrast = useMemo(() => {
    return getContrastRatio(editableTokens.textPrimary, editableTokens.surfaceCard);
  }, [editableTokens.textPrimary, editableTokens.surfaceCard]);

  const accentContrast = useMemo(() => {
    return getContrastRatio(editableTokens.accent, editableTokens.surfaceCard);
  }, [editableTokens.accent, editableTokens.surfaceCard]);

  const textWcag = getWcagRating(textContrast);
  const accentWcag = getWcagRating(accentContrast);

  const handleAutoFixContrast = () => {
    const adjustedText = ensureAccessibleContrast(
      editableTokens.textPrimary,
      editableTokens.surfaceCard,
      7.0 // Target WCAG AAA
    );
    const adjustedAccent = ensureAccessibleContrast(
      editableTokens.accent,
      editableTokens.surfaceCard,
      4.5 // Target WCAG AA
    );
    setEditableTokens((prev) => ({
      ...prev,
      textPrimary: adjustedText,
      accent: adjustedAccent,
    }));
    showToast('Auto-adjusted tokens to guarantee WCAG compliance', 'success');
  };

  const handleApplyCustomHarmonic = async () => {
    const next: ThemeConfig = {
      ...draftConfig,
      activePaletteId: null,
      customPalette: editableTokens,
      accentColor: editableTokens.accent,
      secondaryAccentColor: editableTokens.secondary,
      colorMode: harmonyMode,
      threeDLighting: {
        ...(draftConfig.threeDLighting || {}),
        ambientLightColor: editableTokens.ambientLight,
        shadowColor: editableTokens.shadowTint,
        glassTint: editableTokens.glassTint,
        glowColor: editableTokens.borderGlow,
        highlightColor: editableTokens.highlight,
      },
    };
    updateDraft(next);
    await onApplyConfig(next);
    showToast(`Applied custom harmonic palette "${customPaletteName}"`, 'success');
  };

  const handleRandomHarmonic = () => {
    const isDark = harmonyMode === 'dark';
    const randomPal = generateRandomHarmonicPalette(isDark);
    setSeedColor(randomPal.tokens.accent);
    setEditableTokens(randomPal.tokens);
    showToast(`Generated random harmonic theme "${randomPal.name}"`, 'info');
  };

  // AI-Assisted suggestions
  const aiSuggestions = useMemo(() => {
    return generateAiPaletteSuggestions(seedColor, 'focus');
  }, [seedColor]);

  // ==========================================
  // SECTION 3: 3D LIGHTING & GRADIENTS STATE
  // ==========================================
  const currentGradConfig: GradientConfig = useMemo(() => {
    return (
      draftConfig.gradientConfig || {
        type: 'mesh',
        angle: 135,
        stops: [
          { color: draftConfig.accentColor || '#6366f1', position: 0 },
          { color: draftConfig.secondaryAccentColor || '#8b5cf6', position: 50 },
          { color: '#09090b', position: 100 },
        ],
        animated: false,
      }
    );
  }, [draftConfig.gradientConfig, draftConfig.accentColor, draftConfig.secondaryAccentColor]);

  const current3DLighting: ThreeDLightingConfig = useMemo(() => {
    return (
      draftConfig.threeDLighting || {
        ambientLightColor: draftConfig.accentColor || '#6366f1',
        shadowColor: '#000000',
        glassTint: 'rgba(255, 255, 255, 0.08)',
        glowColor: draftConfig.accentColor || '#6366f1',
        highlightColor: 'rgba(255, 255, 255, 0.2)',
        cardElevation: 12,
        depthIntensity: 100,
        glassBlur: 16,
        glassOpacity: 0.85,
      }
    );
  }, [draftConfig.threeDLighting, draftConfig.accentColor]);

  const update3DLighting = (patch: Partial<ThreeDLightingConfig>) => {
    const nextLighting = { ...current3DLighting, ...patch };
    const nextConfig: ThemeConfig = {
      ...draftConfig,
      threeDLighting: nextLighting,
    };
    updateDraft(nextConfig);
    if (isFullAppPreview) {
      startFullAppPreview(nextConfig);
    }
  };

  const updateGradientConfig = (patch: Partial<GradientConfig>) => {
    const nextGrad: GradientConfig = { ...currentGradConfig, ...patch };
    const nextConfig: ThemeConfig = {
      ...draftConfig,
      gradientConfig: nextGrad,
    };
    updateDraft(nextConfig);
    if (isFullAppPreview) {
      startFullAppPreview(nextConfig);
    }
  };

  const handleAddGradientStop = () => {
    if (currentGradConfig.stops.length >= 5) {
      showToast('Maximum 5 gradient stops supported', 'info');
      return;
    }
    const stops = [...currentGradConfig.stops];
    const newPos = Math.round((stops[stops.length - 1].position + stops[stops.length - 2]?.position || 50) / 2);
    stops.splice(stops.length - 1, 0, {
      color: draftConfig.accentColor || '#38bdf8',
      position: newPos,
    });
    // re-sort by position
    stops.sort((a, b) => a.position - b.position);
    updateGradientConfig({ stops });
  };

  const handleRemoveGradientStop = (idx: number) => {
    if (currentGradConfig.stops.length <= 2) {
      showToast('Minimum 2 gradient stops required', 'info');
      return;
    }
    const stops = currentGradConfig.stops.filter((_, i) => i !== idx);
    updateGradientConfig({ stops });
  };

  const handleUpdateGradientStop = (idx: number, patch: Partial<GradientStop>) => {
    const stops = currentGradConfig.stops.map((stop, i) =>
      i === idx ? { ...stop, ...patch } : stop
    );
    updateGradientConfig({ stops });
  };

  const liveGradientCss = useMemo(() => {
    return generateGradientCss(currentGradConfig);
  }, [currentGradConfig]);

  const handleCopyGradientCss = () => {
    navigator.clipboard.writeText(`background-image: ${liveGradientCss};`);
    showToast('Copied CSS gradient declaration to clipboard', 'success');
  };

  const handleApplyGradientBackdrop = async () => {
    const nextConfig: ThemeConfig = {
      ...draftConfig,
      gradientConfig: currentGradConfig,
      threeDLighting: current3DLighting,
    };
    updateDraft(nextConfig);
    await onApplyConfig(nextConfig);
    showToast('Applied 3D Lighting & Backdrop Gradient across application', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Ecosystem Sub-Tabs Navigation */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('library')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all"
            style={{
              background: activeSubTab === 'library' ? 'var(--ff-accent)' : 'transparent',
              color: activeSubTab === 'library' ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
            }}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>100+ Palettes Library</span>
            <ThemeBadge tone={activeSubTab === 'library' ? 'neutral' : 'accent'}>
              20 Categories
            </ThemeBadge>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('harmony')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all"
            style={{
              background: activeSubTab === 'harmony' ? 'var(--ff-accent)' : 'transparent',
              color: activeSubTab === 'harmony' ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Harmonic Color Generator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('3d-gradient')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all"
            style={{
              background: activeSubTab === '3d-gradient' ? 'var(--ff-accent)' : 'transparent',
              color: activeSubTab === '3d-gradient' ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
            }}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D Lighting &amp; Gradients</span>
          </button>
        </div>

        {/* Global Live Preview Bar */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          {isFullAppPreview ? (
            <ThemeButton variant="secondary" size="xs" onClick={stopFullAppPreview}>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Exit Live Preview</span>
            </ThemeButton>
          ) : (
            <ThemeButton
              variant="secondary"
              size="xs"
              onClick={() => startFullAppPreview(draftConfig)}
              title="Preview changes live across Dashboard, Timer, and Finance"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Entire App</span>
            </ThemeButton>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: 100+ CURATED PALETTES LIBRARY                                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'library' && (
        <div className="space-y-6">
          {/* Header controls: Search, Categories, Surprise Me */}
          <ThemeCard className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
                  <span>Curated Color Library (100 Palettes)</span>
                  <ThemeBadge tone="accent">5 Palettes × 20 Categories</ThemeBadge>
                </h3>
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Explore 100 mathematically balanced color systems. Click any palette to preview or apply instantly.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ThemeButton variant="secondary" size="sm" onClick={handleSurpriseMePalette}>
                  <Wand2 className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                  <span>Surprise Me</span>
                </ThemeButton>

                <div className="relative w-full md:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
                  <ThemeInput
                    type="search"
                    value={paletteSearch}
                    onChange={(e) => setPaletteSearch(e.target.value)}
                    placeholder="Search 100 palettes..."
                    className="pl-8 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 20 Category Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all"
                style={{
                  background: selectedCategory === 'all' ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                  color: selectedCategory === 'all' ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                  borderColor: selectedCategory === 'all' ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                }}
              >
                All (100)
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('favorites')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all"
                style={{
                  background: selectedCategory === 'favorites' ? '#f59e0b' : 'var(--ff-surface-muted)',
                  color: selectedCategory === 'favorites' ? '#000000' : 'var(--ff-text-secondary)',
                  borderColor: selectedCategory === 'favorites' ? '#f59e0b' : 'var(--ff-border-color)',
                }}
              >
                <Heart className="w-3 h-3 fill-current" />
                <span>Favorites ({favoriteIds.length})</span>
              </button>

              {PALETTE_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border transition-all"
                    style={{
                      background: isSelected ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                      color: isSelected ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                      borderColor: isSelected ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                    }}
                    title={cat.description}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </ThemeCard>

          {/* Palettes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPalettes.map((palette) => {
              const isApplied = draftConfig.activePaletteId === palette.id;
              const isFav = favoriteIds.includes(palette.id);
              const contrastRatio = getContrastRatio(palette.tokens.textPrimary, palette.tokens.surfaceCard);
              const rating = getWcagRating(contrastRatio);

              return (
                <div
                  key={palette.id}
                  className="group relative flex flex-col justify-between p-3.5 rounded-2xl border transition-all hover:border-[var(--ff-accent)] hover:shadow-lg"
                  style={{
                    background: 'var(--ff-surface-card)',
                    borderColor: isApplied ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                    boxShadow: isApplied ? '0 0 0 1px var(--ff-accent)' : 'none',
                  }}
                >
                  {/* Top Bar: Name + Favorite Icon */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                            {palette.name}
                          </h4>
                          {isApplied && <ThemeBadge tone="success">Active</ThemeBadge>}
                        </div>
                        <span className="text-[10px] text-[var(--ff-text-muted)]">
                          {CATEGORY_METADATA[palette.category].name}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(palette.id, e)}
                        className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-amber-400 transition-colors"
                        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`}
                        />
                      </button>
                    </div>

                    {/* 5-Color Swatch Strip */}
                    <div className="rounded-xl overflow-hidden border border-[var(--ff-border-color)] my-2.5 shadow-inner">
                      <div className="grid grid-cols-5 h-12">
                        <div
                          className="h-full relative group/swatch"
                          style={{ background: palette.tokens.bgCanvas }}
                          title={`Canvas: ${palette.tokens.bgCanvas}`}
                        />
                        <div
                          className="h-full relative group/swatch"
                          style={{ background: palette.tokens.surfaceCard }}
                          title={`Surface: ${palette.tokens.surfaceCard}`}
                        />
                        <div
                          className="h-full relative group/swatch"
                          style={{ background: palette.tokens.accent }}
                          title={`Accent: ${palette.tokens.accent}`}
                        />
                        <div
                          className="h-full relative group/swatch"
                          style={{ background: palette.tokens.secondary }}
                          title={`Secondary: ${palette.tokens.secondary}`}
                        />
                        <div
                          className="h-full relative group/swatch flex items-center justify-center font-bold text-[10px]"
                          style={{
                            background: palette.tokens.surfaceElevated,
                            color: palette.tokens.textPrimary,
                          }}
                          title={`Text: ${palette.tokens.textPrimary}`}
                        >
                          Aa
                        </div>
                      </div>
                    </div>

                    {/* WCAG Contrast & Tags */}
                    <div className="flex items-center justify-between text-[10px] my-1 text-[var(--ff-text-muted)]">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>WCAG {rating.badge} ({contrastRatio}:1)</span>
                      </span>
                      <span className="font-mono">{palette.tokens.accent.toUpperCase()}</span>
                    </div>

                    <div className="flex flex-wrap gap-1 my-2">
                      {palette.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[var(--ff-border-color)]">
                    <ThemeButton
                      variant="secondary"
                      size="xs"
                      onClick={() => handlePreviewPalette(palette)}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </ThemeButton>
                    <ThemeButton
                      variant={isApplied ? 'secondary' : 'primary'}
                      size="xs"
                      onClick={() => void handleApplyPalette(palette)}
                    >
                      <Check className="w-3 h-3" />
                      <span>{isApplied ? 'Active' : 'Apply'}</span>
                    </ThemeButton>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPalettes.length === 0 && (
            <div className="text-center py-12 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] space-y-2">
              <Palette className="w-8 h-8 mx-auto text-[var(--ff-text-muted)] opacity-50" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">No Palettes Found</h4>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Try searching for another color or resetting category filters.
              </p>
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedCategory('all');
                  setPaletteSearch('');
                }}
              >
                Reset Filters
              </ThemeButton>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: HARMONIC COLOR GENERATOR & CUSTOM BUILDER                    */}
      {/* ========================================================================= */}
      {activeSubTab === 'harmony' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Harmonic Controls & Seed */}
            <div className="lg:col-span-5 space-y-4">
              <ThemeCard className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <h3 className="text-sm font-bold">Color Harmony Engine</h3>
                  </div>
                  <ThemeButton variant="secondary" size="xs" onClick={handleRandomHarmonic}>
                    <RefreshCw className="w-3 h-3" />
                    <span>Randomize</span>
                  </ThemeButton>
                </div>

                {/* Seed Color Picker */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)]">
                    Primary Anchor / Seed Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={seedColor}
                      onChange={(e) => setSeedColor(e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0.5"
                    />
                    <ThemeInput
                      value={seedColor}
                      onChange={(e) => setSeedColor(e.target.value)}
                      className="font-mono text-xs uppercase flex-1"
                      placeholder="#6366F1"
                    />
                  </div>
                </div>

                {/* Harmony Types */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)]">
                    Harmony Theory
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'triadic', label: 'Triadic (Balanced)' },
                        { id: 'analogous', label: 'Analogous (Cohesive)' },
                        { id: 'complementary', label: 'Complementary (Vibrant)' },
                        { id: 'split-complementary', label: 'Split-Comp' },
                        { id: 'tetradic', label: 'Tetradic (Rich 4-Color)' },
                        { id: 'monochromatic', label: 'Monochromatic' },
                      ] as const
                    ).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setHarmonyType(h.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border text-left transition-all"
                        style={{
                          background: harmonyType === h.id ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                          color: harmonyType === h.id ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                          borderColor: harmonyType === h.id ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                        }}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Mode: Dark vs Light */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)]">
                    Target Background Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setHarmonyMode('dark')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-all"
                      style={{
                        background: harmonyMode === 'dark' ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                        color: harmonyMode === 'dark' ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                        borderColor: harmonyMode === 'dark' ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                      }}
                    >
                      Dark Ecosystem
                    </button>
                    <button
                      type="button"
                      onClick={() => setHarmonyMode('light')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-all"
                      style={{
                        background: harmonyMode === 'light' ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                        color: harmonyMode === 'light' ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                        borderColor: harmonyMode === 'light' ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                      }}
                    >
                      Light Ecosystem
                    </button>
                  </div>
                </div>

                {/* AI-Assisted Curated Mood Suggestions */}
                <div className="pt-2 border-t border-[var(--ff-border-color)] space-y-2">
                  <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span>AI-Assisted Suggestions</span>
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {aiSuggestions.map((sug) => (
                      <button
                        key={sug.name}
                        type="button"
                        onClick={() => {
                          setSeedColor(sug.seed);
                          setHarmonyType(sug.harmony);
                        }}
                        className="p-2 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-inset)] hover:border-[var(--ff-accent)] text-left space-y-1 transition-all"
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ background: sug.seed }}
                          />
                          <span className="text-[11px] font-bold text-[var(--ff-text-primary)] truncate">
                            {sug.name}
                          </span>
                        </div>
                        <p className="text-[9px] text-[var(--ff-text-muted)] line-clamp-1">
                          {sug.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </ThemeCard>

              {/* WCAG Accessibility Audit Card */}
              <ThemeCard className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold">Contrast &amp; Accessibility</h3>
                  </div>
                  <ThemeButton variant="secondary" size="xs" onClick={handleAutoFixContrast}>
                    <span>Auto-Fix Contrast</span>
                  </ThemeButton>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-inset)] space-y-1">
                    <span className="text-[10px] text-[var(--ff-text-muted)]">Text on Surface</span>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{textContrast}:1</span>
                      <ThemeBadge tone={textWcag.isAccessible ? 'success' : 'danger'}>
                        WCAG {textWcag.badge}
                      </ThemeBadge>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-inset)] space-y-1">
                    <span className="text-[10px] text-[var(--ff-text-muted)]">Accent on Surface</span>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{accentContrast}:1</span>
                      <ThemeBadge tone={accentWcag.isAccessible ? 'success' : 'danger'}>
                        WCAG {accentWcag.badge}
                      </ThemeBadge>
                    </div>
                  </div>
                </div>
              </ThemeCard>
            </div>

            {/* Right Column: Custom Multi-Token Inspector & Live Mock */}
            <div className="lg:col-span-7 space-y-4">
              <ThemeCard className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                      Generated Palette Tokens
                    </h3>
                    <p className="text-xs text-[var(--ff-text-muted)]">
                      Fine-tune individual semantic color channels before applying.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <ThemeInput
                      value={customPaletteName}
                      onChange={(e) => setCustomPaletteName(e.target.value)}
                      className="text-xs py-1 w-44"
                      placeholder="Palette Name"
                    />
                    <ThemeButton variant="primary" size="sm" onClick={() => void handleApplyCustomHarmonic()}>
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply Palette</span>
                    </ThemeButton>
                  </div>
                </div>

                {/* 10 Token Pickers Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      { key: 'bgCanvas', label: 'Canvas Background' },
                      { key: 'surfaceCard', label: 'Card Surface' },
                      { key: 'surfaceElevated', label: 'Elevated Surface' },
                      { key: 'accent', label: 'Primary Accent' },
                      { key: 'secondary', label: 'Secondary Accent' },
                      { key: 'textPrimary', label: 'Text Primary' },
                      { key: 'textSecondary', label: 'Text Secondary' },
                      { key: 'borderColor', label: 'Border Color' },
                      { key: 'borderGlow', label: 'Glow / Ambient' },
                      { key: 'success', label: 'Success' },
                      { key: 'warning', label: 'Warning' },
                      { key: 'danger', label: 'Danger' },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="p-2 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-inset)] space-y-1"
                    >
                      <span className="text-[10px] text-[var(--ff-text-muted)] block truncate">
                        {item.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editableTokens[item.key] || '#000000'}
                          onChange={(e) => handleTokenChange(item.key, e.target.value)}
                          className="w-6 h-6 rounded-md cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0"
                        />
                        <span className="text-[11px] font-mono text-[var(--ff-text-secondary)] uppercase">
                          {editableTokens[item.key]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Interactive Real-Time Mini Preview */}
                <div className="pt-3 border-t border-[var(--ff-border-color)] space-y-2">
                  <span className="text-xs font-bold text-[var(--ff-text-secondary)]">
                    Live Component Vignette
                  </span>
                  <div
                    className="p-4 rounded-2xl border transition-all space-y-3"
                    style={{
                      backgroundColor: editableTokens.bgCanvas,
                      borderColor: editableTokens.borderColor,
                      color: editableTokens.textPrimary,
                    }}
                  >
                    <div
                      className="p-3.5 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: editableTokens.surfaceCard,
                        borderColor: editableTokens.borderColor,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold" style={{ color: editableTokens.textPrimary }}>
                          Focus Session Active
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: editableTokens.accent,
                            color: '#ffffff',
                          }}
                        >
                          Deep Work
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: editableTokens.textSecondary }}>
                        Remaining Time: 23:45 · Project Alpha Financial Review
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          className="px-3 py-1 text-xs font-bold rounded-lg"
                          style={{
                            backgroundColor: editableTokens.accent,
                            color: '#ffffff',
                          }}
                        >
                          Pause Timer
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1 text-xs font-semibold rounded-lg border"
                          style={{
                            borderColor: editableTokens.borderColor,
                            color: editableTokens.textSecondary,
                          }}
                        >
                          Log Expense ($140)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </ThemeCard>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: 3D LIGHTING & ADVANCED MULTI-STOP GRADIENTS                   */}
      {/* ========================================================================= */}
      {activeSubTab === '3d-gradient' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: 3D Spatial & Ambient Lighting Controls */}
            <div className="lg:col-span-5 space-y-4">
              <ThemeCard className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <h3 className="text-sm font-bold">3D Lighting &amp; Spatial Depth</h3>
                  </div>
                </div>

                {/* Ambient Light & Shadow Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--ff-text-secondary)]">
                      Ambient Lighting Tint
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={current3DLighting.ambientLightColor || '#6366f1'}
                        onChange={(e) => update3DLighting({ ambientLightColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0"
                      />
                      <span className="text-xs font-mono uppercase">
                        {current3DLighting.ambientLightColor}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--ff-text-secondary)]">
                      Shadow Depth Tint
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={current3DLighting.shadowColor || '#000000'}
                        onChange={(e) => update3DLighting({ shadowColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0"
                      />
                      <span className="text-xs font-mono uppercase">
                        {current3DLighting.shadowColor}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Glow & Highlight Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--ff-text-secondary)]">
                      Border Glow Accent
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={current3DLighting.glowColor || '#6366f1'}
                        onChange={(e) => update3DLighting({ glowColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0"
                      />
                      <span className="text-xs font-mono uppercase">
                        {current3DLighting.glowColor}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--ff-text-secondary)]">
                      Top Rim Highlight
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={current3DLighting.highlightColor || '#ffffff'}
                        onChange={(e) => update3DLighting({ highlightColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0"
                      />
                      <span className="text-xs font-mono uppercase">
                        {current3DLighting.highlightColor}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3D Card Elevation Slider */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--ff-border-color)]">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--ff-text-secondary)]">Card Elevation</span>
                    <span className="font-mono text-[var(--ff-accent-text)]">
                      {current3DLighting.cardElevation ?? 12}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={32}
                    value={current3DLighting.cardElevation ?? 12}
                    onChange={(e) => update3DLighting({ cardElevation: Number(e.target.value) })}
                    className="w-full accent-[var(--ff-accent)]"
                  />
                </div>

                {/* Glass Blur & Opacity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[11px] font-semibold text-[var(--ff-text-secondary)]">Glass Blur</span>
                      <span className="font-mono text-[var(--ff-accent-text)]">
                        {current3DLighting.glassBlur ?? 16}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={current3DLighting.glassBlur ?? 16}
                      onChange={(e) => update3DLighting({ glassBlur: Number(e.target.value) })}
                      className="w-full accent-[var(--ff-accent)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[11px] font-semibold text-[var(--ff-text-secondary)]">Depth Intensity</span>
                      <span className="font-mono text-[var(--ff-accent-text)]">
                        {current3DLighting.depthIntensity ?? 100}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={150}
                      value={current3DLighting.depthIntensity ?? 100}
                      onChange={(e) => update3DLighting({ depthIntensity: Number(e.target.value) })}
                      className="w-full accent-[var(--ff-accent)]"
                    />
                  </div>
                </div>
              </ThemeCard>

              {/* Gradient Presets Gallery */}
              <ThemeCard className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                  Gradient Style Presets
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {GRADIENT_PRESET_TEMPLATES.map((tpl, idx) => (
                    <button
                      key={tpl.name || idx}
                      type="button"
                      onClick={() => updateGradientConfig(tpl)}
                      className="p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-inset)] hover:border-[var(--ff-accent)] text-left space-y-1.5 transition-all"
                    >
                      <div
                        className="h-8 rounded-lg border border-white/10"
                        style={{ background: generateGradientCss(tpl) }}
                      />
                      <span className="text-[11px] font-bold block text-[var(--ff-text-primary)] truncate">
                        {tpl.name || `Preset ${idx + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              </ThemeCard>
            </div>

            {/* Right: Multi-Stop Gradient Builder & Live Canvas */}
            <div className="lg:col-span-7 space-y-4">
              <ThemeCard className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                      Multi-Stop Gradient Builder (2–5 Stops)
                    </h3>
                    <p className="text-xs text-[var(--ff-text-muted)]">
                      Linear, Radial, Conic, Mesh, Aurora, and Metallic architectures.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <ThemeButton variant="secondary" size="xs" onClick={handleCopyGradientCss}>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy CSS</span>
                    </ThemeButton>
                    <ThemeButton variant="primary" size="sm" onClick={() => void handleApplyGradientBackdrop()}>
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply to App Backdrop</span>
                    </ThemeButton>
                  </div>
                </div>

                {/* Gradient Type Selectors */}
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      'linear',
                      'radial',
                      'conic',
                      'mesh',
                      'aurora',
                      'metallic',
                    ] as GradientType[]
                  ).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateGradientConfig({ type })}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all"
                      style={{
                        background: currentGradConfig.type === type ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                        color: currentGradConfig.type === type ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                        borderColor: currentGradConfig.type === type ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                      }}
                    >
                      {GRADIENT_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>

                {/* Angle Slider (For Linear & Conic) */}
                {(currentGradConfig.type === 'linear' || currentGradConfig.type === 'conic') && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[var(--ff-text-secondary)]">Gradient Angle</span>
                      <span className="font-mono text-[var(--ff-accent-text)]">
                        {currentGradConfig.angle ?? 135}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={currentGradConfig.angle ?? 135}
                      onChange={(e) => updateGradientConfig({ angle: Number(e.target.value) })}
                      className="w-full accent-[var(--ff-accent)]"
                    />
                  </div>
                )}

                {/* 2 to 5 Customizable Stops */}
                <div className="space-y-2 pt-2 border-t border-[var(--ff-border-color)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--ff-text-secondary)]">
                      Gradient Stops ({currentGradConfig.stops.length}/5)
                    </span>
                    <button
                      type="button"
                      onClick={handleAddGradientStop}
                      disabled={currentGradConfig.stops.length >= 5}
                      className="flex items-center gap-1 text-xs font-semibold text-[var(--ff-accent-text)] hover:underline disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Stop</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {currentGradConfig.stops.map((stop, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-inset)]"
                      >
                        <span className="text-xs font-mono font-bold text-[var(--ff-text-muted)] w-5">
                          #{index + 1}
                        </span>

                        <input
                          type="color"
                          value={stop.color}
                          onChange={(e) => handleUpdateGradientStop(index, { color: e.target.value })}
                          className="w-7 h-7 rounded-lg cursor-pointer border border-[var(--ff-border-color)] bg-transparent p-0"
                        />

                        <input
                          type="text"
                          value={stop.color}
                          onChange={(e) => handleUpdateGradientStop(index, { color: e.target.value })}
                          className="w-24 text-xs font-mono uppercase bg-transparent border-b border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                        />

                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={stop.position}
                            onChange={(e) =>
                              handleUpdateGradientStop(index, { position: Number(e.target.value) })
                            }
                            className="w-full accent-[var(--ff-accent)]"
                          />
                          <span className="text-xs font-mono w-10 text-right text-[var(--ff-text-muted)]">
                            {stop.position}%
                          </span>
                        </div>

                        {currentGradConfig.stops.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveGradientStop(index)}
                            className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-red-400"
                            title="Remove stop"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Gradient Preview Box with Spatial 3D Card Hover */}
                <div className="pt-3 border-t border-[var(--ff-border-color)] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[var(--ff-text-secondary)]">
                      Backdrop &amp; 3D Card Live Render
                    </span>
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      Interactive 3D Hover &amp; Glass Lighting
                    </span>
                  </div>

                  <div
                    className="relative min-h-[220px] rounded-2xl p-6 overflow-hidden flex items-center justify-center border border-[var(--ff-border-color)]"
                    style={{
                      background: liveGradientCss,
                    }}
                  >
                    {/* Floating 3D Card inside gradient */}
                    <div
                      className="ff-card-3d max-w-sm w-full p-4 space-y-3 cursor-pointer"
                      style={{
                        boxShadow: `0 ${current3DLighting.cardElevation || 12}px 32px -4px ${current3DLighting.shadowColor || 'rgba(0,0,0,0.5)'}, 0 0 20px -4px ${current3DLighting.glowColor || 'rgba(99,102,241,0.3)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">Focus &amp; Finance System</span>
                        <ThemeBadge tone="accent">3D Active</ThemeBadge>
                      </div>
                      <p className="text-xs text-[var(--ff-text-secondary)]">
                        Spatial card with customizable rim highlights, glass blur ({current3DLighting.glassBlur}px), and dynamic ambient lighting.
                      </p>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--ff-border-color)]">
                        <span className="text-[var(--ff-text-muted)]">Elevation: {current3DLighting.cardElevation}px</span>
                        <span className="font-bold text-[var(--ff-accent-text)]">Balanced Depth</span>
                      </div>
                    </div>
                  </div>
                </div>
              </ThemeCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
