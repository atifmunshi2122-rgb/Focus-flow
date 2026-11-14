import React, { useMemo, useState } from 'react';
import {
  DesignStyleId,
  StyleFusionConfig,
  ThemeConfig,
} from '../../types/theme.ts';
import {
  DEFAULT_FUSION_CONFIG,
  FUSION_PRESET_TEMPLATES,
  FusionPresetTemplate,
} from '../../theme/styleFusionEngine.ts';
import { DESIGN_STYLES, getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { buildThemeCssVariables, sanitizeThemeConfig } from '../../theme/themeEngine.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
} from '../ui/ThemePrimitives.tsx';
import {
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Sliders,
  Wand2,
  Zap,
} from 'lucide-react';

interface StyleFusionMixerProps {
  draftConfig: ThemeConfig;
  updateDraft: (patch: Partial<ThemeConfig>) => void;
  onApplyConfig: (config: ThemeConfig) => Promise<void>;
  onSaveCustomTheme: (name: string, config: ThemeConfig, description?: string) => Promise<unknown>;
  isFullAppPreview: boolean;
  startFullAppPreview: (config: ThemeConfig) => void;
  stopFullAppPreview: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const StyleFusionMixer: React.FC<StyleFusionMixerProps> = ({
  draftConfig,
  updateDraft,
  onApplyConfig,
  onSaveCustomTheme,
  isFullAppPreview,
  startFullAppPreview,
  stopFullAppPreview,
  showToast,
}) => {
  const currentFusion: StyleFusionConfig = useMemo(() => {
    return draftConfig.fusionConfig || {
      ...DEFAULT_FUSION_CONFIG,
      primaryStyleId: draftConfig.styleId === 'glazed_clay' ? 'claymorphism' : draftConfig.styleId,
      secondaryStyleId: 'glassmorphism',
    };
  }, [draftConfig.fusionConfig, draftConfig.styleId]);

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    draftConfig.styleId === 'glazed_clay' ? 'glazed_clay' : null
  );
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [themeName, setThemeName] = useState('');

  const primaryDef = getStyleDefinition(currentFusion.primaryStyleId);
  const secondaryDef = getStyleDefinition(currentFusion.secondaryStyleId);

  const handleUpdateField = (field: keyof StyleFusionConfig, value: unknown) => {
    setActiveTemplateId(null);
    const nextFusion: StyleFusionConfig = {
      ...currentFusion,
      [field]: value,
    };
    const nextConfig: ThemeConfig = {
      ...draftConfig,
      styleId: nextFusion.primaryStyleId,
      fusionConfig: nextFusion,
    };
    updateDraft(nextConfig);
    if (isFullAppPreview) {
      startFullAppPreview(nextConfig);
    }
  };

  const handleApplyTemplate = (template: FusionPresetTemplate) => {
    setActiveTemplateId(template.id);
    const targetStyleId: DesignStyleId =
      template.id === 'glazed_clay'
        ? 'glazed_clay'
        : template.id === 'cyber_glass'
        ? 'cyber_glass'
        : template.id === 'soft_glass'
        ? 'soft_glass'
        : template.config.primaryStyleId;

    const nextConfig: ThemeConfig = {
      ...draftConfig,
      styleId: targetStyleId,
      cardRadius: null,
      fusionConfig: template.config,
    };
    updateDraft(nextConfig);
    if (isFullAppPreview) {
      startFullAppPreview(nextConfig);
    }
    showToast(`Loaded ${template.name} fusion template`, 'info');
  };

  const handleApplyLive = async () => {
    const configToApply = sanitizeThemeConfig({
      ...draftConfig,
      fusionConfig: currentFusion,
    });
    await onApplyConfig(configToApply);
  };

  const handleSaveTheme = async () => {
    const finalName = themeName.trim() || `${primaryDef.name} + ${secondaryDef.name} Fusion`;
    const configToSave = sanitizeThemeConfig({
      ...draftConfig,
      fusionConfig: currentFusion,
    });
    await onSaveCustomTheme(
      finalName,
      configToSave,
      `Hybrid fusion of ${primaryDef.name} & ${secondaryDef.name} with ${currentFusion.blendRatio}% blend`
    );
    setSaveModalOpen(false);
    setThemeName('');
  };

  // Compute preview CSS variables dynamically for the live sandbox
  const previewVars = useMemo(() => {
    const previewConfig: ThemeConfig = {
      ...draftConfig,
      styleId: currentFusion.primaryStyleId,
      fusionConfig: currentFusion,
    };
    const resolvedMode =
      previewConfig.colorMode === 'system' ? 'dark' : previewConfig.colorMode;
    return buildThemeCssVariables(previewConfig, resolvedMode);
  }, [draftConfig, currentFusion]);

  return (
    <div className="space-y-6">
      {/* Header & Quick Template Shelf */}
      <ThemeCard variant="elevated" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--ff-accent), var(--ff-accent-secondary))',
                color: 'var(--ff-accent-contrast)',
                boxShadow: 'var(--ff-shadow-button)',
              }}
            >
              <Wand2 className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-[var(--ff-text-primary)]">
                  Style Fusion Mixer
                </h3>
                <ThemeBadge tone="accent">Hybrid Design Engine</ThemeBadge>
              </div>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Blend any two design styles together. Dial in translucency, 3D inflation, specular rims, and spring physics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeButton
              variant={isFullAppPreview ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                if (isFullAppPreview) {
                  stopFullAppPreview();
                } else {
                  startFullAppPreview({
                    ...draftConfig,
                    fusionConfig: currentFusion,
                  });
                }
              }}
            >
              {isFullAppPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isFullAppPreview ? 'Exit App Preview' : 'Preview on App'}</span>
            </ThemeButton>

            <ThemeButton variant="primary" size="sm" onClick={handleApplyLive}>
              <Zap className="w-3.5 h-3.5" />
              <span>Apply Hybrid Style</span>
            </ThemeButton>

            <ThemeButton variant="secondary" size="sm" onClick={() => setSaveModalOpen(true)}>
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save Preset</span>
            </ThemeButton>
          </div>
        </div>

        {/* Curated Hybrid Templates */}
        <div className="space-y-2 pt-2 border-t border-[var(--ff-border-color)]">
          <span className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider">
            Curated Hybrid Fusion Recipes
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {FUSION_PRESET_TEMPLATES.map((tpl) => {
              const isActive =
                activeTemplateId === tpl.id ||
                (tpl.id === 'glazed_clay' && draftConfig.styleId === 'glazed_clay');
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="text-left p-2.5 rounded-xl border transition-all relative overflow-hidden group"
                  style={{
                    background: isActive ? 'var(--ff-surface-elevated)' : 'var(--ff-surface-card)',
                    borderColor: isActive ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                    boxShadow: isActive ? '0 0 0 1px var(--ff-accent)' : 'none',
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                      {tpl.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {tpl.previewColors.map((c, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full border border-black/20"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-1">
                    {tpl.tagline}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </ThemeCard>

      {/* Main Mixer Layout: Parent Selectors & Sliders + Live Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Controls & Dials (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Style Pair Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Primary Base Style */}
            <div className="p-3.5 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                  1. Base Architecture
                </span>
                <ThemeBadge tone="accent">{primaryDef.category}</ThemeBadge>
              </div>
              <select
                aria-label="Select base architecture style"
                value={currentFusion.primaryStyleId}
                onChange={(e) => handleUpdateField('primaryStyleId', e.target.value as DesignStyleId)}
                className="ff-input text-xs p-2"
              >
                {DESIGN_STYLES.filter((s) => s.category !== 'hybrid').map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name} ({style.tagline.split(',')[0]})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Provides base canvas surfaces, typography, and foundational geometry.
              </p>
            </div>

            {/* Secondary Fusion Style */}
            <div className="p-3.5 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                  2. Fusion Overlay Style
                </span>
                <ThemeBadge tone="neutral">{secondaryDef.category}</ThemeBadge>
              </div>
              <select
                aria-label="Select fusion overlay style"
                value={currentFusion.secondaryStyleId}
                onChange={(e) => handleUpdateField('secondaryStyleId', e.target.value as DesignStyleId)}
                className="ff-input text-xs p-2"
              >
                {DESIGN_STYLES.filter((s) => s.category !== 'hybrid').map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name} ({style.tagline.split(',')[0]})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Injects glass translucency, specular rim highlights, and atmospheric depth.
              </p>
            </div>
          </div>

          {/* Dials & Sliders Card */}
          <ThemeCard className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Fine-Tuning Dials
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  updateDraft({
                    ...draftConfig,
                    fusionConfig: DEFAULT_FUSION_CONFIG,
                  });
                  showToast('Reset fusion dials to default', 'info');
                }}
                className="text-[11px] font-semibold text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Dial 1: Blend Balance */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-[var(--ff-text-primary)]">
                    Style Blend Balance ({primaryDef.name} ↔ {secondaryDef.name})
                  </span>
                  <span className="font-mono text-[var(--ff-accent-text)]">
                    {currentFusion.blendRatio}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={currentFusion.blendRatio}
                  onChange={(e) => handleUpdateField('blendRatio', Number(e.target.value))}
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>

              {/* Dial 2: Translucency & Frosted Transparency */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-[var(--ff-text-primary)]">
                    Translucency &amp; Glass Transparency (Glassmorphism factor)
                  </span>
                  <span className="font-mono text-[var(--ff-accent-text)]">
                    {currentFusion.translucency}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={currentFusion.translucency}
                  onChange={(e) => handleUpdateField('translucency', Number(e.target.value))}
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>

              {/* Dial 3: 3D Inflation & Pillowy Bevels */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-[var(--ff-text-primary)]">
                    3D Inflation &amp; Tactile Bevels (Claymorphism depth)
                  </span>
                  <span className="font-mono text-[var(--ff-accent-text)]">
                    {currentFusion.inflation}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={currentFusion.inflation}
                  onChange={(e) => handleUpdateField('inflation', Number(e.target.value))}
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>

              {/* Dial 4: Backdrop Blur */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-[var(--ff-text-primary)]">
                    Backdrop Refraction Blur
                  </span>
                  <span className="font-mono text-[var(--ff-accent-text)]">
                    {currentFusion.blur}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="32"
                  step="2"
                  value={currentFusion.blur}
                  onChange={(e) => handleUpdateField('blur', Number(e.target.value))}
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>

              {/* Dial 5: Specular Rim Border */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-[var(--ff-text-primary)]">
                    Specular Rim Light &amp; Border Polish
                  </span>
                  <span className="font-mono text-[var(--ff-accent-text)]">
                    {currentFusion.borderSpecularity}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={currentFusion.borderSpecularity}
                  onChange={(e) =>
                    handleUpdateField('borderSpecularity', Number(e.target.value))
                  }
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>

              {/* Dial 6: Spring Bounciness */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-[var(--ff-text-primary)]">
                    Spring Bounce Physics &amp; Haptic Lift
                  </span>
                  <span className="font-mono text-[var(--ff-accent-text)]">
                    {currentFusion.springFactor}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={currentFusion.springFactor}
                  onChange={(e) => handleUpdateField('springFactor', Number(e.target.value))}
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>
            </div>
          </ThemeCard>
        </div>

        {/* Right: Live Interactive Sandbox (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
              <span>Real-Time Hybrid Sandbox</span>
            </span>
            <ThemeBadge tone="accent">
              {primaryDef.name} × {secondaryDef.name}
            </ThemeBadge>
          </div>

          {/* Scoped CSS Sandbox with previewVars */}
          <div
            data-design-style={currentFusion.primaryStyleId}
            style={{
              ...(previewVars as React.CSSProperties),
              backgroundColor: 'var(--ff-bg-canvas)',
              backgroundImage: 'var(--ff-bg-backdrop)',
              color: 'var(--ff-text-primary)',
              borderRadius: 'var(--ff-radius-card)',
              border: 'var(--ff-border-width) solid var(--ff-border-color)',
            }}
            className="p-5 rounded-3xl relative overflow-hidden space-y-4 transition-all duration-300"
          >
            {/* Ambient orb simulation */}
            <div
              className="absolute -top-10 -right-10 w-44 h-44 rounded-full pointer-events-none filter blur-2xl"
              style={{
                background: 'radial-gradient(circle, var(--ff-accent-soft), transparent 70%)',
              }}
            />
            <div
              className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full pointer-events-none filter blur-2xl"
              style={{
                background: 'radial-gradient(circle, var(--ff-warning-soft), transparent 70%)',
              }}
            />

            {/* Hero Card inside Sandbox */}
            <div className="ff-hero-banner relative z-10 space-y-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                  Fused Aesthetics
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20">
                  {currentFusion.translucency}% Glass · {currentFusion.inflation}% Clay
                </span>
              </div>
              <h4 className="text-base font-bold">
                Tactile Frosted Flow
              </h4>
              <p className="text-xs opacity-85">
                Translucent frosted panes inflated with organic 3D pillow depth.
              </p>
            </div>

            {/* Interactive Card */}
            <div className="ff-card ff-card-interactive relative z-10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[var(--ff-text-primary)]">
                    Focus &amp; Financial Wealth
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)]">
                    120 min focused · ₹45,200 balance
                  </div>
                </div>
                <ThemeBadge tone="success">+18%</ThemeBadge>
              </div>

              <div className="ff-progress-track h-2 w-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: '68%',
                    background:
                      'linear-gradient(90deg, var(--ff-accent), var(--ff-accent-secondary))',
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  className="ff-btn ff-btn-primary px-3 py-1.5 text-xs flex-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>Interactive Button</span>
                </button>
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary px-3 py-1.5 text-xs flex-1"
                >
                  <span>Secondary</span>
                </button>
              </div>
            </div>

            {/* Segmented Control */}
            <div className="ff-segmented w-full justify-between relative z-10">
              <button
                type="button"
                data-active="true"
                className="ff-segmented-item flex-1 py-1 text-center text-xs"
              >
                Day
              </button>
              <button
                type="button"
                data-active="false"
                className="ff-segmented-item flex-1 py-1 text-center text-xs"
              >
                Week
              </button>
              <button
                type="button"
                data-active="false"
                className="ff-segmented-item flex-1 py-1 text-center text-xs"
              >
                Month
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <ThemeCard variant="elevated" className="max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-[var(--ff-text-primary)]">
                Save Hybrid Theme Preset
              </h4>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-[var(--ff-text-muted)]">
              Name this custom fusion style to save it to your presets and sync it to Firebase.
            </p>

            <ThemeInput
              placeholder={`e.g. My ${primaryDef.name} + ${secondaryDef.name} Fusion`}
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              autoFocus
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <ThemeButton variant="secondary" size="sm" onClick={() => setSaveModalOpen(false)}>
                Cancel
              </ThemeButton>
              <ThemeButton variant="primary" size="sm" onClick={handleSaveTheme}>
                <Check className="w-3.5 h-3.5" />
                <span>Save Hybrid Preset</span>
              </ThemeButton>
            </div>
          </ThemeCard>
        </div>
      )}
    </div>
  );
};
