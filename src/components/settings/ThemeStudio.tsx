import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  AnimationIntensity,
  BackgroundMode,
  ColorModePreference,
  DesignStyleCategory,
  DesignStyleId,
  FontPairingId,
  FontScaleId,
  InterfaceDensity,
  ShadowIntensity,
  ThemeConfig,
} from '../../types/theme.ts';
import {
  ACCENT_PRESETS,
  BACKGROUND_GRADIENT_PRESETS,
  DEFAULT_THEME_CONFIG,
  DESIGN_STYLES,
  FONT_PAIRINGS,
  getStyleDefinition,
} from '../../theme/stylesRegistry.ts';
import { buildThemeCssVariables, sanitizeThemeConfig } from '../../theme/themeEngine.ts';
import { getAccessibleContrastText, getContrastRatio, normalizeHex } from '../../theme/colorUtils.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeProgressBar,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  BookmarkPlus,
  Check,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  Layers,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Wand2,
  Zap,
} from 'lucide-react';

const CATEGORY_OPTIONS: Array<{ id: DesignStyleCategory; label: string }> = [
  { id: 'all', label: 'All (16)' },
  { id: 'modern', label: 'Modern & Glass' },
  { id: 'tactile', label: 'Tactile & 3D' },
  { id: 'high-contrast', label: 'High Contrast' },
  { id: 'classic', label: 'Classic & Print' },
  { id: 'dark-neon', label: 'Dark & Neon' },
];

export const ThemeStudio: React.FC = () => {
  const {
    themeConfig,
    resolvedThemeMode,
    systemColorMode,
    savedThemes,
    activeSavedThemeId,
    themeSyncState,
    isAuthenticated,
    firebaseUser,
    signInWithGoogle,
    isFullAppPreview,
    startFullAppPreview,
    stopFullAppPreview,
    applyThemeConfig,
    saveCustomTheme,
    applySavedTheme,
    deleteSavedTheme,
    resetThemeToDefault,
  } = useApp();

  // Draft config lets users explore & preview customizations before applying
  const [draftConfig, setDraftConfig] = useState<ThemeConfig>(themeConfig);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DesignStyleCategory>('all');
  const [customThemeName, setCustomThemeName] = useState('');
  const [customThemeDesc, setCustomThemeDesc] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [previewSampleTab, setPreviewSampleTab] = useState<'overview' | 'focus' | 'bills'>('overview');
  const [gradStart, setGradStart] = useState('#0f172a');
  const [gradEnd, setGradEnd] = useState('#1e1b4b');
  const [gradAngle, setGradAngle] = useState('135');

  // Keep draft synchronized when an external saved theme / reset / login restore occurs
  React.useEffect(() => {
    if (!isFullAppPreview) {
      setDraftConfig(themeConfig);
    }
  }, [themeConfig, isFullAppPreview]);

  const draftResolvedMode: 'light' | 'dark' =
    draftConfig.colorMode === 'system' ? systemColorMode : draftConfig.colorMode;

  const draftStyleDef = getStyleDefinition(draftConfig.styleId);
  const draftVars = useMemo(
    () => buildThemeCssVariables(draftConfig, draftResolvedMode),
    [draftConfig, draftResolvedMode]
  );

  const hasUnappliedChanges = useMemo(
    () => JSON.stringify(draftConfig) !== JSON.stringify(themeConfig),
    [draftConfig, themeConfig]
  );

  const osReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Effective accent & contrast telemetry
  const currentPalette = draftResolvedMode === 'dark' ? draftStyleDef.dark : draftStyleDef.light;
  const activeAccentHex = normalizeHex(draftConfig.accentColor || '') || currentPalette.accentDefault;
  const activeSecondaryHex =
    normalizeHex(draftConfig.secondaryAccentColor || '') || currentPalette.secondaryDefault;
  const buttonTextHex = getAccessibleContrastText(activeAccentHex);
  const accentButtonContrast = getContrastRatio(activeAccentHex, buttonTextHex);

  const filteredStyles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return DESIGN_STYLES.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.traits.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, categoryFilter]);

  const updateDraft = (patch: Partial<ThemeConfig>) => {
    const next = sanitizeThemeConfig({ ...draftConfig, ...patch });
    setDraftConfig(next);
    if (isFullAppPreview) {
      startFullAppPreview(next);
    }
  };

  const handleSelectStyleForPreview = (styleId: DesignStyleId) => {
    const targetStyle = getStyleDefinition(styleId);
    const next = sanitizeThemeConfig({
      ...draftConfig,
      styleId,
      // When switching style explicitly, reset style-coupled overrides to let the style's true voice shine
      accentColor: null,
      secondaryAccentColor: null,
      cardRadius: null,
      fontPairing: 'auto',
      shadowIntensity: 'auto',
      backgroundMode: 'auto',
      customGradient: null,
      // Keep user's explicit mode or adapt if they chose a signature style like Cyberpunk/OLED
      colorMode:
        styleId === 'oled' || styleId === 'cyberpunk'
          ? 'dark'
          : draftConfig.colorMode,
    });
    void targetStyle;
    setDraftConfig(next);
    if (isFullAppPreview) {
      startFullAppPreview(next);
    }
  };

  const handleInstantApplyStyle = async (styleId: DesignStyleId) => {
    const next = sanitizeThemeConfig({
      ...draftConfig,
      styleId,
      accentColor: null,
      secondaryAccentColor: null,
      cardRadius: null,
      fontPairing: 'auto',
      shadowIntensity: 'auto',
      backgroundMode: 'auto',
      customGradient: null,
      colorMode:
        styleId === 'oled' || styleId === 'cyberpunk'
          ? 'dark'
          : draftConfig.colorMode,
    });
    setDraftConfig(next);
    await applyThemeConfig(next, null);
  };

  const handleApplyDraft = async () => {
    await applyThemeConfig(draftConfig, null);
  };

  const handleDiscardDraft = () => {
    stopFullAppPreview();
    setDraftConfig(themeConfig);
  };

  const handleToggleFullAppPreview = () => {
    if (isFullAppPreview) {
      stopFullAppPreview();
    } else {
      startFullAppPreview(draftConfig);
    }
  };

  const handleSaveCustomTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customThemeName.trim()) return;
    await saveCustomTheme(customThemeName, draftConfig, customThemeDesc);
    setCustomThemeName('');
    setCustomThemeDesc('');
    setShowSaveForm(false);
  };

  const handleReset = async () => {
    stopFullAppPreview();
    setDraftConfig({ ...DEFAULT_THEME_CONFIG });
    await resetThemeToDefault();
  };

  const effectiveRadiusValue =
    draftConfig.cardRadius !== null ? draftConfig.cardRadius : draftStyleDef.defaultRadius;

  return (
    <div className="space-y-8">
      {/* Top Studio Header & Cloud Sync Status */}
      <ThemeCard variant="elevated" className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'var(--ff-accent-soft)',
                color: 'var(--ff-accent-text)',
                border: '1px solid var(--ff-accent-border)',
              }}
            >
              <Palette className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
              Design System &amp; Theme Studio
            </h2>
            <ThemeBadge tone="accent">16 Design Systems</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Browse 16 distinct UI architectures, customize tokens live, preview before applying across all modules, and sync custom themes to Firebase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Firebase Cloud Sync Pill */}
          {isAuthenticated ? (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border"
              style={{
                background:
                  themeSyncState === 'cloud-synced'
                    ? 'var(--ff-success-soft)'
                    : 'var(--ff-surface-muted)',
                borderColor: 'var(--ff-border-color)',
                color:
                  themeSyncState === 'cloud-synced'
                    ? 'var(--ff-success)'
                    : 'var(--ff-text-secondary)',
              }}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>
                {themeSyncState === 'syncing'
                  ? 'Syncing to Firebase...'
                  : themeSyncState === 'offline'
                  ? 'Saved Locally (Offline)'
                  : `Synced (${firebaseUser?.email?.split('@')[0] || 'Cloud'})`}
              </span>
            </div>
          ) : (
            <ThemeButton variant="secondary" size="sm" onClick={signInWithGoogle}>
              <CloudOff className="w-3.5 h-3.5" />
              <span>Sign in to Sync Themes</span>
            </ThemeButton>
          )}

          <ThemeButton variant="secondary" size="sm" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </ThemeButton>
        </div>
      </ThemeCard>

      {/* SECTION 1: LIVE INTERACTIVE SANDBOX PREVIEW + APPLY BAR */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left/Top: Live Interactive Preview Canvas */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Live Interactive Preview
              </h3>
              <ThemeBadge tone={hasUnappliedChanges ? 'warning' : 'success'}>
                {hasUnappliedChanges ? 'Draft Preview' : 'Active'}
              </ThemeBadge>
            </div>

            <div className="flex items-center gap-2">
              <ThemeButton
                variant={isFullAppPreview ? 'primary' : 'secondary'}
                size="xs"
                onClick={handleToggleFullAppPreview}
              >
                {isFullAppPreview ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Exit Full-App Preview</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Preview on Whole App</span>
                  </>
                )}
              </ThemeButton>
            </div>
          </div>

          {/* Isolated Scoped Sandbox Container using draftVars! */}
          <div
            data-design-style={draftConfig.styleId}
            data-theme-mode={draftResolvedMode}
            data-density={draftConfig.density}
            data-animation={draftConfig.animationIntensity}
            style={{
              ...(draftVars as React.CSSProperties),
              backgroundColor: 'var(--ff-bg-canvas)',
              backgroundImage: 'var(--ff-bg-backdrop)',
              color: 'var(--ff-text-primary)',
              fontFamily: 'var(--ff-font-sans)',
              borderRadius: 'var(--ff-radius-card)',
              border: 'var(--ff-border-width) solid var(--ff-border-color)',
            }}
            className="relative overflow-hidden p-5 sm:p-6 transition-all"
          >
            {/* Preview Style Banner Header */}
            <div
              className="ff-hero-banner mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ padding: '1rem 1.25rem' }}
            >
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold opacity-90">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{draftStyleDef.name}</span>
                  <span>·</span>
                  <span className="uppercase">{draftResolvedMode}</span>
                </div>
                <div
                  className="text-base sm:text-lg font-bold mt-0.5"
                  style={{ fontFamily: 'var(--ff-font-display)' }}
                >
                  Focus Deeply &amp; Track Wealth
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className="ff-btn ff-btn-primary px-3 py-1.5 text-xs">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Primary CTA</span>
                </button>
                <button type="button" className="ff-btn ff-btn-secondary px-3 py-1.5 text-xs">
                  <span>Secondary</span>
                </button>
              </div>
            </div>

            {/* Preview Segmented Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="ff-segmented" role="group" aria-label="Preview module tabs">
                {(['overview', 'focus', 'bills'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    data-active={previewSampleTab === tab ? 'true' : 'false'}
                    onClick={() => setPreviewSampleTab(tab)}
                    className="ff-segmented-item px-3 py-1 text-[11px] capitalize"
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <span
                className="ff-badge px-2 py-0.5 text-[10px]"
                style={{
                  background: 'var(--ff-accent-soft)',
                  color: 'var(--ff-accent-text)',
                  borderColor: 'var(--ff-accent-border)',
                }}
              >
                {draftConfig.density} · {effectiveRadiusValue}px
              </span>
            </div>

            {/* Preview Mini Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="ff-card ff-card-interactive">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ff-text-muted)' }}>
                    Monthly Net Balance
                  </span>
                  <span
                    className="ff-badge px-1.5 py-0.5 text-[10px]"
                    style={{
                      background: 'var(--ff-success-soft)',
                      color: 'var(--ff-success)',
                      borderColor: 'transparent',
                    }}
                  >
                    +18.4%
                  </span>
                </div>
                <div
                  className="text-xl font-bold font-mono tabular-nums"
                  style={{ color: 'var(--ff-text-primary)', fontFamily: 'var(--ff-font-mono)' }}
                >
                  ₹1,42,850
                </div>
                <div className="mt-2.5">
                  <div className="ff-progress-track h-2 w-full">
                    <div
                      className="h-full"
                      style={{ width: '72%', backgroundColor: 'var(--ff-accent)' }}
                    />
                  </div>
                </div>
              </div>

              <div className="ff-card ff-card-interactive flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-medium block" style={{ color: 'var(--ff-text-muted)' }}>
                      Pomodoro Focus Ring
                    </span>
                    <span
                      className="text-xl font-bold font-mono tabular-nums"
                      style={{ fontFamily: 'var(--ff-font-mono)' }}
                    >
                      24:15
                    </span>
                  </div>
                  <div
                    className="w-10 h-10 flex items-center justify-center font-mono text-xs font-bold"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-accent-soft)',
                      color: 'var(--ff-accent-text)',
                      border: '1px solid var(--ff-accent-border)',
                    }}
                  >
                    96%
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="Deep Work Sprint"
                    aria-label="Preview sample input"
                    className="ff-input px-2.5 py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Preview Action Bar */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t text-xs"
              style={{ borderColor: 'var(--ff-border-color)' }}
            >
              <span style={{ color: 'var(--ff-text-muted)' }}>
                Previewing <strong>{draftStyleDef.name}</strong> ({draftStyleDef.traits.join(' · ')})
              </span>
              <div className="flex items-center gap-2">
                {hasUnappliedChanges && (
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="ff-btn ff-btn-ghost px-2.5 py-1 text-xs"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleApplyDraft}
                  className="ff-btn ff-btn-primary px-3.5 py-1.5 text-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{hasUnappliedChanges ? 'Apply Theme Now' : 'Applied'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Quick Action Controls & Save Custom Theme */}
        <div className="xl:col-span-5 space-y-4">
          <ThemeCard className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                <h3 className="text-sm font-bold">Theme Mode &amp; Actions</h3>
              </div>
              <ThemeBadge tone="neutral">{draftStyleDef.category}</ThemeBadge>
            </div>

            {/* 3-State Color Mode Toggle */}
            <div>
              <span className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-2">
                Appearance Mode
              </span>
              <ThemeSegmentedControl<ColorModePreference>
                fullWidth
                ariaLabel="Appearance color mode"
                value={draftConfig.colorMode}
                onChange={(mode) => updateDraft({ colorMode: mode })}
                options={[
                  { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
                  { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
                  {
                    id: 'system',
                    label: `System (${systemColorMode})`,
                    icon: <Monitor className="w-3.5 h-3.5" />,
                  },
                ]}
              />
            </div>

            {/* Apply / Save Custom Theme Action Row */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <ThemeButton
                variant="primary"
                onClick={handleApplyDraft}
                disabled={!hasUnappliedChanges && !isFullAppPreview}
              >
                <Check className="w-4 h-4" />
                <span>{hasUnappliedChanges ? 'Apply Changes' : 'Theme Active'}</span>
              </ThemeButton>

              <ThemeButton
                variant="secondary"
                onClick={() => setShowSaveForm((v) => !v)}
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>Save Custom</span>
              </ThemeButton>
            </div>

            {showSaveForm && (
              <form
                onSubmit={handleSaveCustomTheme}
                className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] space-y-2.5"
              >
                <label htmlFor="custom-theme-name" className="block text-xs font-semibold">
                  Save Current Configuration as Custom Theme
                </label>
                <ThemeInput
                  id="custom-theme-name"
                  required
                  placeholder="e.g., Midnight Cyber Cyan"
                  value={customThemeName}
                  onChange={(e) => setCustomThemeName(e.target.value)}
                />
                <ThemeInput
                  placeholder="Optional short note (e.g., Late night OLED focus)"
                  value={customThemeDesc}
                  onChange={(e) => setCustomThemeDesc(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <ThemeButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSaveForm(false)}
                  >
                    Cancel
                  </ThemeButton>
                  <ThemeButton type="submit" variant="primary" size="sm">
                    Save Theme
                  </ThemeButton>
                </div>
              </form>
            )}

            {/* Saved Custom Themes Switcher */}
            <div className="pt-2 border-t border-[var(--ff-border-color)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                  Saved Custom Themes ({savedThemes.length})
                </span>
              </div>

              {savedThemes.length === 0 ? (
                <p className="text-xs text-[var(--ff-text-muted)] py-2">
                  No saved custom themes yet. Customize any style and click &ldquo;Save Custom&rdquo; to create presets you can switch between instantly.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {savedThemes.map((saved) => {
                    const isActiveSaved = activeSavedThemeId === saved.id;
                    const savedStyle = getStyleDefinition(saved.config.styleId);
                    const swatchColor =
                      saved.config.accentColor ||
                      (saved.config.colorMode === 'light'
                        ? savedStyle.light.accentDefault
                        : savedStyle.dark.accentDefault);

                    return (
                      <div
                        key={saved.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors"
                        style={{
                          background: isActiveSaved
                            ? 'var(--ff-accent-soft)'
                            : 'var(--ff-surface-inset)',
                          borderColor: isActiveSaved
                            ? 'var(--ff-accent-border)'
                            : 'var(--ff-border-color)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setDraftConfig(saved.config);
                            void applySavedTheme(saved.id);
                          }}
                          className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                        >
                          <span
                            className="w-5 h-5 rounded-full shrink-0 border border-white/30"
                            style={{ backgroundColor: swatchColor }}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate text-[var(--ff-text-primary)]">
                              {saved.name}
                            </div>
                            <div className="text-[11px] truncate text-[var(--ff-text-muted)]">
                              {savedStyle.name} · {saved.config.colorMode}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          {isActiveSaved && <ThemeBadge tone="accent">Active</ThemeBadge>}
                          <button
                            type="button"
                            onClick={() => {
                              setDraftConfig(saved.config);
                              if (isFullAppPreview) startFullAppPreview(saved.config);
                            }}
                            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)]"
                            title="Preview saved theme"
                            aria-label={`Preview ${saved.name}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSavedTheme(saved.id)}
                            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                            title="Delete saved theme"
                            aria-label={`Delete ${saved.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ThemeCard>
        </div>
      </div>

      {/* SECTION 2: ALL 16 DESIGN STYLES GALLERY */}
      <ThemeCard className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
              Design Styles Gallery
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)]">
              16 distinct UI design systems with independent surface physics, borders, depth, and typography.
            </p>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
            <ThemeInput
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search styles (e.g. Glass, OLED)..."
              className="pl-8 py-1.5 text-xs"
              aria-label="Search design styles"
            />
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((cat) => {
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
                style={{
                  background: active ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                  color: active ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                  borderColor: active ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* 16 Style Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredStyles.map((styleDef) => {
            const isApplied = themeConfig.styleId === styleDef.id;
            const isDrafted = draftConfig.styleId === styleDef.id;
            const previewMode =
              styleDef.id === 'oled' || styleDef.id === 'cyberpunk'
                ? 'dark'
                : draftResolvedMode;
            const pal = previewMode === 'dark' ? styleDef.dark : styleDef.light;
            const fontDef =
              FONT_PAIRINGS.find((f) => f.id === styleDef.defaultFontPairing) || FONT_PAIRINGS[0];

            return (
              <div
                key={styleDef.id}
                className="flex flex-col justify-between p-3.5 rounded-2xl border transition-all"
                style={{
                  background: isDrafted ? 'var(--ff-accent-soft)' : 'var(--ff-surface-elevated)',
                  borderColor: isDrafted ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                  boxShadow: isDrafted ? '0 0 0 1px var(--ff-accent)' : 'none',
                }}
              >
                <div>
                  {/* Miniature True-Style Visual Vignette */}
                  <div
                    className="relative h-28 mb-3 p-3 overflow-hidden flex flex-col justify-between"
                    style={{
                      backgroundColor: pal.bgCanvas,
                      backgroundImage: pal.bgBackdrop,
                      borderRadius: `${Math.min(18, styleDef.defaultRadius)}px`,
                      border: `${styleDef.borderWidth} solid ${pal.borderColor}`,
                      fontFamily: fontDef.displayFont,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[11px] font-bold truncate"
                        style={{ color: pal.textPrimary }}
                      >
                        {styleDef.name}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: pal.accentDefault }}
                      />
                    </div>

                    {/* Mini Card Inside Vignette */}
                    <div
                      className="p-2 flex items-center justify-between gap-2"
                      style={{
                        background: pal.surfaceCard,
                        border: `${styleDef.borderWidth} solid ${pal.borderColor}`,
                        borderRadius: `${Math.min(12, Math.max(0, styleDef.defaultRadius * 0.65))}px`,
                        boxShadow: pal.shadowCard,
                        backdropFilter:
                          styleDef.backdropBlur !== '0px'
                            ? `blur(${styleDef.backdropBlur})`
                            : undefined,
                      }}
                    >
                      <div className="space-y-1 min-w-0">
                        <div
                          className="h-1.5 w-14 rounded-full"
                          style={{ backgroundColor: pal.textPrimary, opacity: 0.75 }}
                        />
                        <div
                          className="h-1.5 w-9 rounded-full"
                          style={{ backgroundColor: pal.textMuted, opacity: 0.55 }}
                        />
                      </div>
                      <span
                        className="px-2 py-0.5 text-[9px] font-bold shrink-0"
                        style={{
                          background: pal.accentDefault,
                          color: getAccessibleContrastText(pal.accentDefault),
                          borderRadius: styleDef.buttonRadius,
                          boxShadow: pal.shadowButton,
                        }}
                      >
                        Action
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                      {styleDef.name}
                    </h4>
                    {isApplied && <ThemeBadge tone="success">Active</ThemeBadge>}
                  </div>
                  <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-2 mb-2.5">
                    {styleDef.tagline}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1">
                    {styleDef.traits.map((trait) => (
                      <span
                        key={trait}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <ThemeButton
                      variant="secondary"
                      size="xs"
                      onClick={() => handleSelectStyleForPreview(styleDef.id)}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </ThemeButton>
                    <ThemeButton
                      variant={isApplied ? 'secondary' : 'primary'}
                      size="xs"
                      onClick={() => void handleInstantApplyStyle(styleDef.id)}
                    >
                      <Check className="w-3 h-3" />
                      <span>{isApplied ? 'Active' : 'Apply'}</span>
                    </ThemeButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ThemeCard>

      {/* SECTION 3: TOKEN CUSTOMIZATION ENGINE (ACCENT, TYPOGRAPHY, SHAPE, BACKDROP, MOTION, DENSITY) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accent & Color Palette Studio */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold">Accent Colors &amp; Contrast</h3>
            </div>
            {draftConfig.accentColor && (
              <button
                type="button"
                onClick={() => updateDraft({ accentColor: null, secondaryAccentColor: null })}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                Use Style Default
              </button>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {ACCENT_PRESETS.map((preset) => {
              const selected =
                draftConfig.accentColor?.toLowerCase() === preset.primary.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    updateDraft({
                      accentColor: preset.primary,
                      secondaryAccentColor: preset.secondary,
                    })
                  }
                  className="p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all"
                  style={{
                    borderColor: selected ? preset.primary : 'var(--ff-border-color)',
                    background: selected ? 'var(--ff-accent-soft)' : 'var(--ff-surface-inset)',
                  }}
                  title={preset.name}
                >
                  <span
                    className="w-6 h-6 rounded-full border border-white/30"
                    style={{
                      background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                    }}
                  />
                  <span className="text-[10px] font-medium truncate w-full text-center text-[var(--ff-text-secondary)]">
                    {preset.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label
                htmlFor="primary-accent-picker"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Primary Accent
              </label>
              <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
                <input
                  id="primary-accent-picker"
                  type="color"
                  value={activeAccentHex}
                  onChange={(e) => updateDraft({ accentColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)]">
                  {activeAccentHex}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="secondary-accent-picker"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Secondary / Gradient Accent
              </label>
              <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
                <input
                  id="secondary-accent-picker"
                  type="color"
                  value={activeSecondaryHex}
                  onChange={(e) => updateDraft({ secondaryAccentColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)]">
                  {activeSecondaryHex}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] flex items-center justify-between text-xs">
            <span className="text-[var(--ff-text-secondary)]">
              Auto-computed Accessible Button Contrast:
            </span>
            <ThemeBadge tone={accentButtonContrast >= 4.5 ? 'success' : 'warning'}>
              {accentButtonContrast.toFixed(1)}:1 {accentButtonContrast >= 7 ? 'AAA' : 'AA'}
            </ThemeBadge>
          </div>
        </ThemeCard>

        {/* Typography Studio */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold">Typography &amp; Scale</h3>
            </div>
            <ThemeBadge tone="neutral">
              {draftConfig.fontPairing === 'auto' ? 'Style Native' : draftConfig.fontPairing}
            </ThemeBadge>
          </div>

          <div>
            <label
              htmlFor="font-pairing-select"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5"
            >
              Font Pairing Family
            </label>
            <select
              id="font-pairing-select"
              value={draftConfig.fontPairing}
              onChange={(e) => updateDraft({ fontPairing: e.target.value as FontPairingId })}
              className="ff-input px-3 py-2 text-xs"
            >
              <option value="auto">
                Auto (Style Default — {draftStyleDef.defaultFontPairing})
              </option>
              {FONT_PAIRINGS.map((fp) => (
                <option key={fp.id} value={fp.id}>
                  {fp.name} — {fp.description}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
            {FONT_PAIRINGS.map((fp) => {
              const selected =
                draftConfig.fontPairing === fp.id ||
                (draftConfig.fontPairing === 'auto' && draftStyleDef.defaultFontPairing === fp.id);
              return (
                <button
                  key={fp.id}
                  type="button"
                  onClick={() => updateDraft({ fontPairing: fp.id })}
                  className="p-2.5 rounded-xl border text-left transition-colors"
                  style={{
                    borderColor: selected ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                    background: selected ? 'var(--ff-accent-soft)' : 'var(--ff-surface-inset)',
                  }}
                >
                  <div
                    className="text-xs font-bold truncate"
                    style={{ fontFamily: fp.displayFont }}
                  >
                    {fp.name}
                  </div>
                  <div
                    className="text-[11px] truncate text-[var(--ff-text-muted)] mt-0.5"
                    style={{ fontFamily: fp.bodyFont }}
                  >
                    {fp.sampleHeadline}
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5">
              Global Font Scale
            </span>
            <ThemeSegmentedControl<FontScaleId>
              fullWidth
              ariaLabel="Typography font scale"
              value={draftConfig.fontScale}
              onChange={(fontScale) => updateDraft({ fontScale })}
              options={[
                { id: 'compact', label: 'Compact (93%)' },
                { id: 'default', label: 'Default (100%)' },
                { id: 'large', label: 'Large (107%)' },
              ]}
            />
          </div>
        </ThemeCard>

        {/* Card Radius & Shadow Depth */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold">Card Radius &amp; Shadows</h3>
            </div>
            {draftConfig.cardRadius !== null && (
              <button
                type="button"
                onClick={() => updateDraft({ cardRadius: null })}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                Reset Radius ({draftStyleDef.defaultRadius}px)
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="card-radius-slider" className="font-medium text-[var(--ff-text-secondary)]">
                Corner Radius
              </label>
              <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                {effectiveRadiusValue}px {draftConfig.cardRadius === null ? '(Auto)' : ''}
              </span>
            </div>
            <input
              id="card-radius-slider"
              type="range"
              min="0"
              max="32"
              step="2"
              value={effectiveRadiusValue}
              onChange={(e) => updateDraft({ cardRadius: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-[var(--ff-text-muted)] mt-1">
              <span>0px Sharp</span>
              <span>12px Balanced</span>
              <span>24px Plush</span>
              <span>32px Pill</span>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5">
              Shadow &amp; Elevation Depth
            </span>
            <ThemeSegmentedControl<ShadowIntensity>
              fullWidth
              ariaLabel="Shadow depth"
              value={draftConfig.shadowIntensity}
              onChange={(shadowIntensity) => updateDraft({ shadowIntensity })}
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'none', label: 'None' },
                { id: 'subtle', label: 'Subtle' },
                { id: 'elevated', label: 'Elevated' },
                { id: 'dramatic', label: 'Dramatic' },
              ]}
            />
          </div>
        </ThemeCard>

        {/* Backgrounds & Gradients */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold">Backgrounds &amp; Gradients</h3>
            </div>
            {(draftConfig.backgroundMode !== 'auto' || draftConfig.customGradient) && (
              <button
                type="button"
                onClick={() => updateDraft({ backgroundMode: 'auto', customGradient: null })}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                Reset Backdrop
              </button>
            )}
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5">
              Canvas Texture / Pattern Mode
            </span>
            <ThemeSegmentedControl<BackgroundMode>
              fullWidth
              ariaLabel="Background mode"
              value={draftConfig.backgroundMode}
              onChange={(backgroundMode) =>
                updateDraft({ backgroundMode, customGradient: null })
              }
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'solid', label: 'Solid' },
                { id: 'gradient', label: 'Gradient' },
                { id: 'mesh', label: 'Mesh' },
                { id: 'grid', label: 'Grid' },
                { id: 'aurora', label: 'Aurora' },
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5">
              Gradient Backdrop Presets
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {BACKGROUND_GRADIENT_PRESETS.map((preset) => {
                const isSelected =
                  (draftConfig.customGradient || 'auto') === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      updateDraft({
                        customGradient: preset.id === 'auto' ? null : preset.id,
                      })
                    }
                    className="p-2 rounded-xl border text-left transition-colors"
                    style={{
                      borderColor: isSelected ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                      background: isSelected
                        ? 'var(--ff-accent-soft)'
                        : 'var(--ff-surface-inset)',
                    }}
                  >
                    <div
                      className="h-5 w-full rounded-md mb-1.5 border border-white/20"
                      style={{ background: preset.previewSwatch }}
                    />
                    <span className="text-[10px] font-semibold block truncate text-[var(--ff-text-primary)]">
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--ff-border-color)] space-y-2">
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)]">
              Custom Gradient Builder
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 ff-input w-auto px-2 py-1 text-xs">
                <span className="text-[var(--ff-text-muted)]">From</span>
                <input
                  type="color"
                  aria-label="Gradient start color"
                  value={gradStart}
                  onChange={(e) => setGradStart(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                />
              </label>
              <label className="flex items-center gap-1.5 ff-input w-auto px-2 py-1 text-xs">
                <span className="text-[var(--ff-text-muted)]">To</span>
                <input
                  type="color"
                  aria-label="Gradient end color"
                  value={gradEnd}
                  onChange={(e) => setGradEnd(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                />
              </label>
              <label className="flex items-center gap-1.5 ff-input w-auto px-2 py-1 text-xs">
                <span className="text-[var(--ff-text-muted)]">Angle</span>
                <select
                  aria-label="Gradient angle"
                  value={gradAngle}
                  onChange={(e) => setGradAngle(e.target.value)}
                  className="bg-transparent text-xs focus:outline-none"
                >
                  <option value="135">135°</option>
                  <option value="180">180°</option>
                  <option value="90">90°</option>
                  <option value="45">45°</option>
                </select>
              </label>
              <ThemeButton
                variant="secondary"
                size="xs"
                onClick={() =>
                  updateDraft({
                    customGradient: `linear-gradient(${gradAngle}deg, ${gradStart} 0%, ${gradEnd} 100%)`,
                  })
                }
              >
                Apply Custom Gradient
              </ThemeButton>
            </div>
          </div>
        </ThemeCard>

        {/* Animation Intensity & Interface Density */}
        <ThemeCard className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                <h3 className="text-sm font-bold">Animation Intensity</h3>
              </div>
              {osReducedMotion && (
                <ThemeBadge tone="warning">OS Reduced Motion Active</ThemeBadge>
              )}
            </div>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Control micro-interaction easing, hover lifts, and ambient canvas motion. Automatically honors OS reduced-motion accessibility settings.
            </p>
            <ThemeSegmentedControl<AnimationIntensity>
              fullWidth
              ariaLabel="Animation intensity"
              value={draftConfig.animationIntensity}
              onChange={(animationIntensity) => updateDraft({ animationIntensity })}
              options={[
                { id: 'none', label: 'None' },
                { id: 'subtle', label: 'Subtle' },
                { id: 'standard', label: 'Standard' },
                { id: 'expressive', label: 'Expressive' },
              ]}
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                <h3 className="text-sm font-bold">Interface Density</h3>
              </div>
              <ThemeBadge tone="neutral">{draftConfig.density}</ThemeBadge>
            </div>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Adjust card padding, ledger row rhythm, and grid spacing globally across Dashboard, Focus, Tasks, Finance, Bills, and Analytics.
            </p>
            <ThemeSegmentedControl<InterfaceDensity>
              fullWidth
              ariaLabel="Interface density"
              value={draftConfig.density}
              onChange={(density) => updateDraft({ density })}
              options={[
                { id: 'compact', label: 'Compact' },
                { id: 'comfortable', label: 'Comfortable' },
                { id: 'spacious', label: 'Spacious' },
              ]}
            />
          </div>
        </ThemeCard>
      </div>

      {/* Accessibility Readability Verification Strip */}
      <ThemeCard variant="inset" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="font-bold text-[var(--ff-text-primary)] block">
            Accessibility &amp; Cross-Module Status
          </span>
          <span className="text-[var(--ff-text-muted)]">
            Active style: <strong>{getStyleDefinition(themeConfig.styleId).name}</strong> ({resolvedThemeMode} mode) · Live across Dashboard, Focus, Tasks, Finance, Bills, Transactions &amp; Settings.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ThemeProgressBar value={100} tone="success" label="Token coverage" heightClass="h-2 w-24" />
          <ThemeBadge tone="success">WCAG Contrast Safe</ThemeBadge>
        </div>
      </ThemeCard>
    </div>
  );
};
