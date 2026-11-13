import React, { useState } from 'react';
import { BackgroundMode, GradientConfig, ThemeConfig, ThreeDLightingConfig } from '../../types/theme.ts';
import { BACKGROUND_GRADIENT_PRESETS } from '../../theme/stylesRegistry.ts';
import { ThemeBadge, ThemeButton, ThemeCard, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import { Sparkles, Sun, Wand2, RotateCcw, Palette, Layers, Flame } from 'lucide-react';

interface BackgroundStudioPanelProps {
  draftConfig: ThemeConfig;
  updateDraft: (patch: Partial<ThemeConfig>) => void;
  showToast?: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

export const BackgroundStudioPanel: React.FC<BackgroundStudioPanelProps> = ({
  draftConfig,
  updateDraft,
  showToast,
}) => {
  const [gradStart, setGradStart] = useState('#0f172a');
  const [gradEnd, setGradEnd] = useState('#3b82f6');
  const [gradMiddle, setGradMiddle] = useState('#8b5cf6');
  const [includeMiddleStop, setIncludeMiddleStop] = useState(false);
  const [gradAngle, setGradAngle] = useState('135');
  const [isAnimated, setIsAnimated] = useState(draftConfig.gradientConfig?.animated ?? false);

  const threeD = draftConfig.threeDLighting || {};
  const ambientIntensity = threeD.ambientLightIntensity ?? 40;
  const ambientColor = threeD.ambientLightColor ?? '#6366f1';
  const glowIntensity = threeD.glowIntensity ?? 50;
  const glowColor = threeD.glowColor ?? '#8b5cf6';

  const updateThreeD = (patch: Partial<ThreeDLightingConfig>) => {
    updateDraft({
      threeDLighting: {
        ...threeD,
        ...patch,
      },
    });
  };

  const handleApplyCustomGradient = () => {
    const stops = [
      { color: gradStart, position: 0 },
      ...(includeMiddleStop ? [{ color: gradMiddle, position: 50 }] : []),
      { color: gradEnd, position: 100 },
    ];

    const gradientConf: GradientConfig = {
      name: 'Custom Studio Gradient',
      type: isAnimated ? 'animated' : 'linear',
      angle: Number(gradAngle) || 135,
      stops,
      animated: isAnimated,
      speedSeconds: 15,
    };

    updateDraft({
      backgroundMode: 'gradient',
      customGradient: `linear-gradient(${gradAngle}deg, ${gradStart} 0%, ${
        includeMiddleStop ? `${gradMiddle} 50%, ` : ''
      }${gradEnd} 100%)`,
      gradientConfig: gradientConf,
    });

    if (showToast) {
      showToast('Custom background gradient applied', 'success');
    }
  };

  const handleResetBackdrop = () => {
    updateDraft({
      backgroundMode: 'auto',
      customGradient: null,
      gradientConfig: null,
      threeDLighting: {
        ...threeD,
        ambientLightIntensity: 40,
        ambientLightColor: undefined,
        glowIntensity: 50,
        glowColor: undefined,
      },
    });
    if (showToast) {
      showToast('Backdrop reset to style native defaults', 'info');
    }
  };

  const isCustomized =
    draftConfig.backgroundMode !== 'auto' ||
    Boolean(draftConfig.customGradient) ||
    Boolean(draftConfig.gradientConfig) ||
    threeD.ambientLightIntensity !== undefined;

  return (
    <div className="space-y-6">
      {/* Header and Reset Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
              Background Studio &amp; Ambient Lighting
            </h3>
            <ThemeBadge tone="accent">3D Depth Environment</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Configure subtle backdrop shaders, animated mesh textures, gradient backdrops, and physical lighting emission across the whole app.
          </p>
        </div>

        {isCustomized && (
          <ThemeButton variant="secondary" size="xs" onClick={handleResetBackdrop}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Native</span>
          </ThemeButton>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Canvas Texture / Pattern Mode */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Canvas Texture &amp; Pattern Mode
              </h4>
            </div>
            <ThemeBadge tone="neutral">
              {draftConfig.backgroundMode === 'auto' ? 'Auto (Style Native)' : draftConfig.backgroundMode}
            </ThemeBadge>
          </div>

          <p className="text-xs text-[var(--ff-text-muted)]">
            Choose how background surfaces render across the viewport. Grid and Mesh apply algorithmic geometry, while Aurora introduces soft chromatic light pools.
          </p>

          <ThemeSegmentedControl<BackgroundMode>
            fullWidth
            ariaLabel="Background canvas texture mode"
            value={draftConfig.backgroundMode}
            onChange={(backgroundMode) =>
              updateDraft({ backgroundMode, customGradient: null, gradientConfig: null })
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

          {/* Mode Explanation Pill */}
          <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] text-xs text-[var(--ff-text-secondary)]">
            {draftConfig.backgroundMode === 'auto' && 'Style Native: dynamically adapts between dark/light canvas based on active design system.'}
            {draftConfig.backgroundMode === 'solid' && 'Clean Solid: pure, untextured flat canvas without gradients or patterns for zero visual distraction.'}
            {draftConfig.backgroundMode === 'gradient' && 'Harmonic Gradient: 135° dual-color blend generated from primary and secondary theme accents.'}
            {draftConfig.backgroundMode === 'mesh' && 'Tri-point Mesh: radial gradient clusters producing modern, fluid atmospheric depth.'}
            {draftConfig.backgroundMode === 'grid' && 'Engineered Grid: high-precision 28px architectural coordinate lines with subtle opacity.'}
            {draftConfig.backgroundMode === 'aurora' && 'Aurora Waves: multi-chroma emerald and violet luminescence resembling northern lights.'}
          </div>
        </ThemeCard>

        {/* Ambient Lighting & Glow Center */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Ambient Lighting &amp; Specular Glow
              </h4>
            </div>
            <ThemeBadge tone="accent">Physics 3D</ThemeBadge>
          </div>

          <p className="text-xs text-[var(--ff-text-muted)]">
            Emits realistic ray lighting behind cards and modals to create visual separation and soft optical elevation.
          </p>

          <div className="space-y-4">
            {/* Ambient Intensity */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="ambient-intensity-slider" className="font-medium text-[var(--ff-text-secondary)]">
                  Ambient Light Intensity
                </label>
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                  {ambientIntensity}%
                </span>
              </div>
              <input
                id="ambient-intensity-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={ambientIntensity}
                onChange={(e) => updateThreeD({ ambientLightIntensity: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-[var(--ff-text-muted)] mt-1">
                <span>0% Off</span>
                <span>40% Balanced</span>
                <span>100% Radiant</span>
              </div>
            </div>

            {/* Ambient Color and Glow Color */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ambient-color-picker"
                  className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                >
                  Ambient Light Tint
                </label>
                <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
                  <input
                    id="ambient-color-picker"
                    type="color"
                    value={ambientColor}
                    onChange={(e) => updateThreeD({ ambientLightColor: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)] truncate">
                    {ambientColor}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="glow-color-picker"
                  className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                >
                  Edge Glow Tint
                </label>
                <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
                  <input
                    id="glow-color-picker"
                    type="color"
                    value={glowColor}
                    onChange={(e) => updateThreeD({ glowColor: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)] truncate">
                    {glowColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Edge Glow Intensity */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="glow-intensity-slider" className="font-medium text-[var(--ff-text-secondary)]">
                  Specular Rim Glow Intensity
                </label>
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                  {glowIntensity}%
                </span>
              </div>
              <input
                id="glow-intensity-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={glowIntensity}
                onChange={(e) => updateThreeD({ glowIntensity: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
            </div>
          </div>
        </ThemeCard>
      </div>

      {/* Preset Backdrops Library */}
      <ThemeCard className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Curated Backdrop Presets ({BACKGROUND_GRADIENT_PRESETS.length})
            </h4>
          </div>
          <span className="text-xs text-[var(--ff-text-muted)]">Instant single-click application</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {BACKGROUND_GRADIENT_PRESETS.map((preset) => {
            const isSelected = (draftConfig.customGradient || 'auto') === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  updateDraft({
                    customGradient: preset.id === 'auto' ? null : preset.id,
                    backgroundMode: preset.id === 'auto' ? 'auto' : 'gradient',
                  })
                }
                className="p-2.5 rounded-xl border text-left transition-all hover:scale-[1.02] flex flex-col justify-between"
                style={{
                  borderColor: isSelected ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                  background: isSelected ? 'var(--ff-accent-soft)' : 'var(--ff-surface-inset)',
                }}
              >
                <div
                  className="h-10 w-full rounded-lg mb-2 border border-white/20 shadow-inner"
                  style={{ background: preset.previewSwatch }}
                />
                <div>
                  <span className="text-xs font-bold block truncate text-[var(--ff-text-primary)]">
                    {preset.name}
                  </span>
                  <span className="text-[10px] text-[var(--ff-text-muted)] block capitalize">
                    {preset.id === 'auto' ? 'System' : 'Gradient'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ThemeCard>

      {/* Advanced Custom Gradient & Mesh Builder */}
      <ThemeCard className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Custom Multi-Stop Gradient Studio
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--ff-text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={isAnimated}
                onChange={(e) => setIsAnimated(e.target.checked)}
                className="rounded cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>Subtle Shimmer Motion</span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          {/* Start Color */}
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
              Start Color Stop
            </label>
            <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
              <input
                type="color"
                aria-label="Gradient start color"
                value={gradStart}
                onChange={(e) => setGradStart(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)]">
                {gradStart}
              </span>
            </div>
          </div>

          {/* Middle Stop (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[var(--ff-text-secondary)]">
                Mid Stop
              </label>
              <button
                type="button"
                onClick={() => setIncludeMiddleStop(!includeMiddleStop)}
                className="text-[10px] text-[var(--ff-accent-text)] hover:underline"
              >
                {includeMiddleStop ? 'Remove' : '+ Add'}
              </button>
            </div>
            <div className={`flex items-center gap-2 ff-input px-2.5 py-1.5 ${!includeMiddleStop ? 'opacity-40' : ''}`}>
              <input
                type="color"
                aria-label="Gradient middle color"
                disabled={!includeMiddleStop}
                value={gradMiddle}
                onChange={(e) => setGradMiddle(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)]">
                {includeMiddleStop ? gradMiddle : 'Disabled'}
              </span>
            </div>
          </div>

          {/* End Color */}
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
              End Color Stop
            </label>
            <div className="flex items-center gap-2 ff-input px-2.5 py-1.5">
              <input
                type="color"
                aria-label="Gradient end color"
                value={gradEnd}
                onChange={(e) => setGradEnd(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="font-mono text-xs uppercase text-[var(--ff-text-primary)]">
                {gradEnd}
              </span>
            </div>
          </div>

          {/* Angle & Apply Button */}
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
              Angle &amp; Flow
            </label>
            <div className="flex items-center gap-2">
              <select
                aria-label="Gradient angle selector"
                value={gradAngle}
                onChange={(e) => setGradAngle(e.target.value)}
                className="ff-input px-2.5 py-2 text-xs flex-1"
              >
                <option value="45">45° Diagonal</option>
                <option value="90">90° Top to Bottom</option>
                <option value="135">135° Deep Angle</option>
                <option value="180">180° Right to Left</option>
                <option value="225">225° Reverse Angle</option>
                <option value="270">270° Bottom to Top</option>
              </select>

              <ThemeButton variant="primary" size="sm" onClick={handleApplyCustomGradient}>
                <span>Apply</span>
              </ThemeButton>
            </div>
          </div>
        </div>

        {/* Live Swatch Bar */}
        <div
          className="h-8 w-full rounded-xl border border-white/20 shadow-inner"
          style={{
            background: `linear-gradient(${gradAngle}deg, ${gradStart} 0%, ${
              includeMiddleStop ? `${gradMiddle} 50%, ` : ''
            }${gradEnd} 100%)`,
          }}
        />
      </ThemeCard>
    </div>
  );
};
