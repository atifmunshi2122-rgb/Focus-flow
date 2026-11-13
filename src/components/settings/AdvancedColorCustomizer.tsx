import React from 'react';
import { ThemeConfig } from '../../types/theme.ts';
import { ACCENT_PRESETS, getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { getAccessibleContrastText, getContrastRatio, normalizeHex } from '../../theme/colorUtils.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import { Check, Palette, RefreshCw, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';

interface AdvancedColorCustomizerProps {
  draftConfig: ThemeConfig;
  updateDraft: (partial: Partial<ThemeConfig>) => void;
  resolvedMode: 'light' | 'dark';
}

export const AdvancedColorCustomizer: React.FC<AdvancedColorCustomizerProps> = ({
  draftConfig,
  updateDraft,
  resolvedMode,
}) => {
  const styleDef = getStyleDefinition(draftConfig.styleId);
  const basePalette = resolvedMode === 'dark' ? styleDef.dark : styleDef.light;
  const customPal = draftConfig.customPalette || {};

  const currentAccent =
    normalizeHex(draftConfig.accentColor || '') ||
    (customPal.accent ? normalizeHex(customPal.accent) : null) ||
    basePalette.accentDefault ||
    '#6366f1';

  const currentSecondary =
    normalizeHex(draftConfig.secondaryAccentColor || '') ||
    (customPal.secondary ? normalizeHex(customPal.secondary) : null) ||
    basePalette.secondaryDefault ||
    '#8b5cf6';

  const currentBg = customPal.bgCanvas || basePalette.bgCanvas;
  const currentSurface = customPal.surfaceCard || basePalette.surfaceCard;
  const currentText = customPal.textPrimary || basePalette.textPrimary;
  const currentTextSecondary = customPal.textSecondary || basePalette.textSecondary;
  const currentBorder = customPal.borderColor || basePalette.borderColor;

  // Contrast telemetry
  const buttonText = getAccessibleContrastText(currentAccent);
  const contrastRatio = getContrastRatio(currentAccent, buttonText);

  const handlePaletteFieldChange = (field: string, val: string) => {
    updateDraft({
      customPalette: {
        ...(draftConfig.customPalette || {}),
        [field]: val,
      },
    });
  };

  const handleResetColors = () => {
    updateDraft({
      accentColor: null,
      secondaryAccentColor: null,
      customPalette: null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Ready-Made Palette Presets */}
      <ThemeCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Curated Accent &amp; Contrast Presets
            </h3>
          </div>
          {(draftConfig.accentColor || draftConfig.customPalette) && (
            <button
              type="button"
              onClick={handleResetColors}
              className="text-xs font-semibold text-[var(--ff-accent-text)] hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Colors to Default
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {ACCENT_PRESETS.map((preset) => {
            const isSelected =
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
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  isSelected
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)] shadow-xs'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] hover:bg-[var(--ff-surface-hover)]'
                }`}
                title={preset.name}
              >
                <div
                  className="w-7 h-7 rounded-full border border-white/30 shadow-xs"
                  style={{
                    background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                  }}
                />
                <span className="text-[11px] font-semibold truncate text-[var(--ff-text-primary)]">
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      </ThemeCard>

      {/* Granular Color Field Studio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Primary Accent */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Primary Accent</span>
            <span className="text-[10px] text-[var(--ff-text-muted)] font-mono uppercase">
              {currentAccent}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Main interactive color for primary buttons, active tabs, progress rings, and focal elements.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={currentAccent.startsWith('#') ? currentAccent : '#6366f1'}
              onChange={(e) => updateDraft({ accentColor: e.target.value })}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0 shrink-0"
              aria-label="Primary Accent Color Picker"
            />
            <input
              type="text"
              value={draftConfig.accentColor || ''}
              placeholder={basePalette.accentDefault}
              onChange={(e) => updateDraft({ accentColor: e.target.value })}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </ThemeCard>

        {/* 2. Secondary Accent */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Secondary Accent</span>
            <span className="text-[10px] text-[var(--ff-text-muted)] font-mono uppercase">
              {currentSecondary}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Used for gradient pairs, secondary badge highlights, and ambient light glows.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={currentSecondary.startsWith('#') ? currentSecondary : '#8b5cf6'}
              onChange={(e) => updateDraft({ secondaryAccentColor: e.target.value })}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0 shrink-0"
              aria-label="Secondary Accent Color Picker"
            />
            <input
              type="text"
              value={draftConfig.secondaryAccentColor || ''}
              placeholder={basePalette.secondaryDefault}
              onChange={(e) => updateDraft({ secondaryAccentColor: e.target.value })}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </ThemeCard>

        {/* 3. Background Canvas */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Background Canvas</span>
            <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
              {currentBg}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Underlying canvas color of the entire viewport and application backdrop.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={currentBg.startsWith('#') ? currentBg : '#0f172a'}
              onChange={(e) => handlePaletteFieldChange('bgCanvas', e.target.value)}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0 shrink-0"
              aria-label="Background Canvas Color Picker"
            />
            <input
              type="text"
              value={customPal.bgCanvas || ''}
              placeholder={basePalette.bgCanvas}
              onChange={(e) => handlePaletteFieldChange('bgCanvas', e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </ThemeCard>

        {/* 4. Surface Card */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Card Surface Color</span>
            <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
              {currentSurface}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Primary surface background applied to cards, drawers, widgets, and panels.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={currentSurface.startsWith('#') ? currentSurface : '#1e293b'}
              onChange={(e) => handlePaletteFieldChange('surfaceCard', e.target.value)}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0 shrink-0"
              aria-label="Surface Card Color Picker"
            />
            <input
              type="text"
              value={customPal.surfaceCard || ''}
              placeholder={basePalette.surfaceCard}
              onChange={(e) => handlePaletteFieldChange('surfaceCard', e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </ThemeCard>

        {/* 5. Primary Text */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Primary Text Color</span>
            <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
              {currentText}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Highest-contrast text for headings, numbers, title labels, and primary copy.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={currentText.startsWith('#') ? currentText : '#f8fafc'}
              onChange={(e) => handlePaletteFieldChange('textPrimary', e.target.value)}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0 shrink-0"
              aria-label="Primary Text Color Picker"
            />
            <input
              type="text"
              value={customPal.textPrimary || ''}
              placeholder={basePalette.textPrimary}
              onChange={(e) => handlePaletteFieldChange('textPrimary', e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </ThemeCard>

        {/* 6. Border & Stroke */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Border &amp; Divider Color</span>
            <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
              {currentBorder}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Used on card borders, table dividers, input boundaries, and separator lines.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={currentBorder.startsWith('#') ? currentBorder : '#334155'}
              onChange={(e) => handlePaletteFieldChange('borderColor', e.target.value)}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0 shrink-0"
              aria-label="Border Color Picker"
            />
            <input
              type="text"
              value={customPal.borderColor || ''}
              placeholder={basePalette.borderColor}
              onChange={(e) => handlePaletteFieldChange('borderColor', e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </ThemeCard>
      </div>

      {/* WCAG Contrast Verification Strip */}
      <ThemeCard variant="inset" className="p-3.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="text-[var(--ff-text-secondary)]">
            Accent Contrast Ratio: <strong className="font-mono text-[var(--ff-text-primary)]">{contrastRatio.toFixed(1)}:1</strong>
          </span>
        </div>
        <ThemeBadge tone={contrastRatio >= 4.5 ? 'success' : 'warning'}>
          {contrastRatio >= 7 ? 'WCAG AAA (Enhanced)' : contrastRatio >= 4.5 ? 'WCAG AA (Compliant)' : 'Caution (Low Contrast)'}
        </ThemeBadge>
      </ThemeCard>
    </div>
  );
};
