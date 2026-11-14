import React from 'react';
import {
  FontPairingId,
  FontScaleId,
  InterfaceDensity,
  ShadowIntensity,
  ThemeConfig,
  ThreeDLightingConfig,
} from '../../types/theme.ts';
import { FONT_PAIRINGS, getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { ThemeBadge, ThemeButton, ThemeCard, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import { Layers, Box, Sliders, Type, RotateCcw } from 'lucide-react';

interface SurfaceDepthCustomizerProps {
  draftConfig: ThemeConfig;
  updateDraft: (patch: Partial<ThemeConfig>) => void;
  showToast?: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

export const SurfaceDepthCustomizer: React.FC<SurfaceDepthCustomizerProps> = ({
  draftConfig,
  updateDraft,
  showToast,
}) => {
  const styleDef = getStyleDefinition(draftConfig.styleId);
  const effectiveRadius =
    draftConfig.cardRadius !== null && draftConfig.cardRadius !== undefined
      ? draftConfig.cardRadius
      : styleDef.defaultRadius;

  const threeD = draftConfig.threeDLighting || {};
  const glassOpacity = Math.round((threeD.glassOpacity ?? 0.85) * 100);
  const glassBlur = threeD.glassBlur ?? 16;
  const cardElevation = threeD.cardElevation ?? 12;
  const depthIntensity = threeD.depthIntensity ?? 80;

  const updateThreeD = (patch: Partial<ThreeDLightingConfig>) => {
    updateDraft({
      threeDLighting: {
        ...threeD,
        ...patch,
      },
    });
  };

  const handleResetSurface = () => {
    updateDraft({
      cardRadius: null,
      shadowIntensity: 'auto',
      density: 'comfortable',
      fontScale: 'default',
      fontPairing: 'auto',
      threeDLighting: {
        ...threeD,
        glassOpacity: 0.85,
        glassBlur: 16,
        cardElevation: 12,
        depthIntensity: 80,
      },
    });
    if (showToast) {
      showToast('Surface & typography reset to style defaults', 'info');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Reset Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
              Surface Geometry, 3D Depth &amp; Refraction
            </h3>
            <ThemeBadge tone="accent">Haptic Realism</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Sculpt corner radii, optical refraction blur, 3D card elevation, shadow intensity, and global layout density.
          </p>
        </div>

        <ThemeButton variant="secondary" size="xs" onClick={handleResetSurface}>
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Geometry Defaults</span>
        </ThemeButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Corner Radii & Geometry */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Corner Geometry &amp; Radii
              </h4>
            </div>
            <ThemeBadge tone="neutral">
              {draftConfig.cardRadius === null ? `Auto (${styleDef.defaultRadius}px)` : `${effectiveRadius}px`}
            </ThemeBadge>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="surface-radius-slider" className="font-medium text-[var(--ff-text-secondary)]">
                Card &amp; Container Corner Radius
              </label>
              <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                {effectiveRadius}px
              </span>
            </div>
            <input
              id="surface-radius-slider"
              type="range"
              min="0"
              max="32"
              step="2"
              value={effectiveRadius}
              onChange={(e) => updateDraft({ cardRadius: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-[var(--ff-text-muted)] mt-1">
              <span>0px Sharp</span>
              <span>12px Modern</span>
              <span>20px Soft</span>
              <span>32px Pill</span>
            </div>
          </div>

          {/* Quick Radius Presets */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[
              { label: '0px Sharp', value: 0 },
              { label: '12px Balanced', value: 12 },
              { label: '20px Plush', value: 20 },
              { label: '32px Pill', value: 32 },
            ].map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => updateDraft({ cardRadius: preset.value })}
                className="py-1.5 px-2 rounded-lg border text-center text-xs font-semibold transition-colors"
                style={{
                  borderColor: effectiveRadius === preset.value ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                  background: effectiveRadius === preset.value ? 'var(--ff-accent-soft)' : 'var(--ff-surface-inset)',
                  color: effectiveRadius === preset.value ? 'var(--ff-accent-text)' : 'var(--ff-text-secondary)',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Shadow & Elevation Mode */}
          <div className="pt-2 border-t border-[var(--ff-border-color)]">
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5">
              Shadow Projection &amp; Diffusion Depth
            </span>
            <ThemeSegmentedControl<ShadowIntensity>
              fullWidth
              ariaLabel="Shadow intensity depth"
              value={draftConfig.shadowIntensity}
              onChange={(shadowIntensity) => updateDraft({ shadowIntensity })}
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'none', label: 'Flat (None)' },
                { id: 'subtle', label: 'Subtle' },
                { id: 'elevated', label: 'Elevated' },
                { id: 'dramatic', label: 'Dramatic' },
              ]}
            />
          </div>
        </ThemeCard>

        {/* 3D Glass Refraction & Elevation */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Glass Transparency &amp; Optical Blur
              </h4>
            </div>
            <ThemeBadge tone="accent">Aero &amp; Liquid</ThemeBadge>
          </div>

          <div className="space-y-4">
            {/* Glass Opacity */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="glass-opacity-slider" className="font-medium text-[var(--ff-text-secondary)]">
                  Surface Translucency / Opacity
                </label>
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                  {glassOpacity}%
                </span>
              </div>
              <input
                id="glass-opacity-slider"
                type="range"
                min="10"
                max="100"
                step="5"
                value={glassOpacity}
                onChange={(e) => updateThreeD({ glassOpacity: Number(e.target.value) / 100 })}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-[var(--ff-text-muted)] mt-1">
                <span>10% Sheer Glass</span>
                <span>50% Frosted</span>
                <span>100% Opaque Solid</span>
              </div>
            </div>

            {/* Glass Blur */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="glass-blur-slider" className="font-medium text-[var(--ff-text-secondary)]">
                  Backdrop Blur Filter (Refraction)
                </label>
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                  {glassBlur}px
                </span>
              </div>
              <input
                id="glass-blur-slider"
                type="range"
                min="0"
                max="40"
                step="2"
                value={glassBlur}
                onChange={(e) => updateThreeD({ glassBlur: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-[var(--ff-text-muted)] mt-1">
                <span>0px Crystal Clear</span>
                <span>16px Balanced Frosted</span>
                <span>40px Dense Liquid</span>
              </div>
            </div>

            {/* 3D Card Elevation & Depth */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--ff-border-color)]">
              <div>
                <label htmlFor="card-elevation-input" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                  Card 3D Elevation
                </label>
                <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
                  <input
                    id="card-elevation-input"
                    type="range"
                    min="0"
                    max="32"
                    step="2"
                    value={cardElevation}
                    onChange={(e) => updateThreeD({ cardElevation: Number(e.target.value) })}
                    className="w-full cursor-pointer"
                  />
                  <span className="font-mono text-xs font-bold text-[var(--ff-text-primary)] shrink-0">
                    {cardElevation}px
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="depth-intensity-input" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                  Tactile Depth Weight
                </label>
                <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
                  <input
                    id="depth-intensity-input"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={depthIntensity}
                    onChange={(e) => updateThreeD({ depthIntensity: Number(e.target.value) })}
                    className="w-full cursor-pointer"
                  />
                  <span className="font-mono text-xs font-bold text-[var(--ff-text-primary)] shrink-0">
                    {depthIntensity}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ThemeCard>
      </div>

      {/* Typography & Spacing Scale */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Typography Studio */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Typography System &amp; Pairing
              </h4>
            </div>
            <ThemeBadge tone="neutral">
              {draftConfig.fontPairing === 'auto' ? 'Auto (Style Default)' : draftConfig.fontPairing}
            </ThemeBadge>
          </div>

          <div>
            <label
              htmlFor="surface-font-pairing-select"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5"
            >
              Curated Font Pairing
            </label>
            <select
              id="surface-font-pairing-select"
              value={draftConfig.fontPairing}
              onChange={(e) => updateDraft({ fontPairing: e.target.value as FontPairingId })}
              className="ff-input px-3 py-2 text-xs"
            >
              <option value="auto">
                Auto (Style Default — {styleDef.defaultFontPairing})
              </option>
              {FONT_PAIRINGS.map((fp) => (
                <option key={fp.id} value={fp.id}>
                  {fp.name} — {fp.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1.5">
              Global Type Scale
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

        {/* Interface Density Studio */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Interface Density &amp; Spacing Rhythm
              </h4>
            </div>
            <ThemeBadge tone="neutral" className="capitalize">{draftConfig.density}</ThemeBadge>
          </div>

          <p className="text-xs text-[var(--ff-text-muted)]">
            Regulate card padding, dashboard widget margins, table row heights, and ledger breathing room across all screens.
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

          <div className="p-3.5 rounded-xl bg-[var(--ff-surface-muted)] text-xs space-y-1.5">
            <div className="flex items-center justify-between font-medium">
              <span className="text-[var(--ff-text-secondary)]">Card Padding:</span>
              <span className="font-mono text-[var(--ff-text-primary)]">
                {draftConfig.density === 'compact' ? '0.9rem (14px)' : draftConfig.density === 'comfortable' ? '1.25rem (20px)' : '1.65rem (26px)'}
              </span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span className="text-[var(--ff-text-secondary)]">Dashboard Grid Gap:</span>
              <span className="font-mono text-[var(--ff-text-primary)]">
                {draftConfig.density === 'compact' ? '0.75rem (12px)' : draftConfig.density === 'comfortable' ? '1.0rem (16px)' : '1.4rem (22px)'}
              </span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span className="text-[var(--ff-text-secondary)]">Ledger Row Padding:</span>
              <span className="font-mono text-[var(--ff-text-primary)]">
                {draftConfig.density === 'compact' ? '0.625rem' : draftConfig.density === 'comfortable' ? '0.875rem' : '1.15rem'}
              </span>
            </div>
          </div>
        </ThemeCard>
      </div>
    </div>
  );
};
