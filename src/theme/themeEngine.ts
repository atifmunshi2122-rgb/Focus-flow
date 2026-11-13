import {
  BackgroundMode,
  ColorModePreference,
  ThemeConfig,
} from '../types/theme.ts';
import {
  BACKGROUND_GRADIENT_PRESETS,
  DEFAULT_THEME_CONFIG,
  getFontPairing,
  getStyleDefinition,
} from './stylesRegistry.ts';
import {
  ensureReadableAccentOnSurface,
  getAccessibleContrastText,
  hexToRgba,
  mixColors,
  normalizeHex,
} from './colorUtils.ts';
import { getPaletteById } from './palettes100.ts';
import { generateGradientCss } from './gradientEngine.ts';
import { computeFusedTokens } from './styleFusionEngine.ts';

export const THEME_CACHE_KEY = 'ff_theme_cache_v1';

export function getSystemColorMode(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveColorMode(pref: ColorModePreference): 'light' | 'dark' {
  if (pref === 'system') return getSystemColorMode();
  return pref;
}

export function sanitizeThemeConfig(partial?: Partial<ThemeConfig> | null): ThemeConfig {
  if (!partial) return { ...DEFAULT_THEME_CONFIG };
  const styleDef = getStyleDefinition(partial.styleId || DEFAULT_THEME_CONFIG.styleId);
  return {
    styleId: styleDef.id,
    colorMode: partial.colorMode || DEFAULT_THEME_CONFIG.colorMode,
    accentColor: partial.accentColor ?? null,
    secondaryAccentColor: partial.secondaryAccentColor ?? null,
    fontPairing: partial.fontPairing || 'auto',
    fontScale: partial.fontScale || 'default',
    cardRadius:
      typeof partial.cardRadius === 'number' && !Number.isNaN(partial.cardRadius)
        ? Math.max(0, Math.min(32, partial.cardRadius))
        : null,
    shadowIntensity: partial.shadowIntensity || 'auto',
    backgroundMode: partial.backgroundMode || 'auto',
    customGradient: partial.customGradient ?? null,
    animationIntensity: partial.animationIntensity || 'standard',
    density: partial.density || 'comfortable',
    activePaletteId: partial.activePaletteId ?? null,
    customPalette: partial.customPalette ?? null,
    gradientConfig: partial.gradientConfig ?? null,
    threeDLighting: partial.threeDLighting ?? null,
    fusionConfig: partial.fusionConfig
      ? {
          primaryStyleId: partial.fusionConfig.primaryStyleId || 'claymorphism',
          secondaryStyleId: partial.fusionConfig.secondaryStyleId || 'glassmorphism',
          blendRatio: Math.max(0, Math.min(100, partial.fusionConfig.blendRatio ?? 50)),
          translucency: Math.max(0, Math.min(100, partial.fusionConfig.translucency ?? 65)),
          inflation: Math.max(0, Math.min(100, partial.fusionConfig.inflation ?? 75)),
          blur: Math.max(0, Math.min(32, partial.fusionConfig.blur ?? 18)),
          borderSpecularity: Math.max(0, Math.min(100, partial.fusionConfig.borderSpecularity ?? 80)),
          shadowWeight: Math.max(0, Math.min(100, partial.fusionConfig.shadowWeight ?? 60)),
          springFactor: Math.max(0, Math.min(100, partial.fusionConfig.springFactor ?? 85)),
        }
      : null,
  };
}

function buildBackgroundCss(
  mode: Exclude<BackgroundMode, 'auto'>,
  baseCanvas: string,
  accent: string,
  secondary: string,
  resolvedMode: 'light' | 'dark',
  nativeBackdrop: string
): string {
  const isDark = resolvedMode === 'dark';
  switch (mode) {
    case 'solid':
      return baseCanvas;
    case 'gradient':
      return `linear-gradient(135deg, ${mixColors(accent, baseCanvas, isDark ? 0.16 : 0.10)} 0%, ${baseCanvas} 52%, ${mixColors(secondary, baseCanvas, isDark ? 0.14 : 0.10)} 100%)`;
    case 'mesh':
      return `radial-gradient(at 15% 18%, ${hexToRgba(accent, isDark ? 0.28 : 0.22)} 0px, transparent 48%), radial-gradient(at 85% 15%, ${hexToRgba(secondary, isDark ? 0.24 : 0.20)} 0px, transparent 46%), radial-gradient(at 55% 88%, ${hexToRgba(accent, isDark ? 0.18 : 0.14)} 0px, transparent 50%), ${baseCanvas}`;
    case 'grid': {
      const line = hexToRgba(isDark ? accent : '#0f172a', isDark ? 0.09 : 0.06);
      return `linear-gradient(to right, ${line} 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(to bottom, ${line} 1px, transparent 1px) 0 0 / 28px 28px, ${baseCanvas}`;
    }
    case 'aurora':
      return `radial-gradient(at 18% 12%, ${hexToRgba('#10b981', isDark ? 0.24 : 0.18)} 0px, transparent 50%), radial-gradient(at 82% 20%, ${hexToRgba(accent, isDark ? 0.28 : 0.20)} 0px, transparent 48%), radial-gradient(at 48% 85%, ${hexToRgba(secondary, isDark ? 0.24 : 0.18)} 0px, transparent 52%), ${baseCanvas}`;
    default:
      return nativeBackdrop;
  }
}

export function buildThemeCssVariables(
  config: ThemeConfig,
  resolvedMode: 'light' | 'dark'
): Record<string, string> {
  const styleDef = getStyleDefinition(config.styleId);
  const basePalette = resolvedMode === 'dark' ? styleDef.dark : styleDef.light;
  const isDark = resolvedMode === 'dark';

  // Check for active curated palette or custom palette overrides
  const curatedPal = config.activePaletteId ? getPaletteById(config.activePaletteId) : null;
  const palTokens = config.customPalette || curatedPal?.tokens || null;

  // Check for dynamic style fusion configuration
  const fusedTokens = config.fusionConfig
    ? computeFusedTokens(config.fusionConfig, resolvedMode)
    : null;

  // Resolved palette
  const palette = {
    ...basePalette,
    bgCanvas: palTokens?.bgCanvas || basePalette.bgCanvas,
    bgBackdrop: palTokens?.bgBackdrop || basePalette.bgBackdrop,
    surfaceCard: palTokens?.surfaceCard || fusedTokens?.surfaceCard || basePalette.surfaceCard,
    surfaceElevated:
      palTokens?.surfaceElevated || fusedTokens?.surfaceElevated || basePalette.surfaceElevated,
    surfaceMuted: palTokens?.surfaceMuted || basePalette.surfaceMuted,
    surfaceInset: palTokens?.surfaceInset || basePalette.surfaceInset,
    borderColor: palTokens?.borderColor || fusedTokens?.borderColor || basePalette.borderColor,
    borderStrong:
      palTokens?.borderGlow || fusedTokens?.borderStrong || basePalette.borderStrong,
    textPrimary: palTokens?.textPrimary || basePalette.textPrimary,
    textSecondary: palTokens?.textSecondary || basePalette.textSecondary,
    textMuted: palTokens?.textMuted || basePalette.textMuted,
    accentDefault: palTokens?.accent || basePalette.accentDefault,
    secondaryDefault: palTokens?.secondary || basePalette.secondaryDefault,
    success: palTokens?.success || basePalette.success,
    warning: palTokens?.warning || basePalette.warning,
    danger: palTokens?.danger || basePalette.danger,
    info: palTokens?.info || basePalette.info,
  };

  // Typography
  const fontPairingId =
    config.fontPairing === 'auto' ? styleDef.defaultFontPairing : config.fontPairing;
  const fontDef = getFontPairing(fontPairingId);
  const fontScaleVal =
    config.fontScale === 'compact' ? '0.93' : config.fontScale === 'large' ? '1.07' : '1';

  // Colors & Contrast
  const accent: string =
    normalizeHex(config.accentColor || '') ||
    (palTokens?.accent ? normalizeHex(palTokens.accent) : null) ||
    palette.accentDefault ||
    '#6366f1';
  const secondary: string =
    normalizeHex(config.secondaryAccentColor || '') ||
    (palTokens?.secondary ? normalizeHex(palTokens.secondary) : null) ||
    palette.secondaryDefault ||
    '#8b5cf6';
  const accentContrast = getAccessibleContrastText(accent);

  const surfaceSampleHex =
    normalizeHex(palette.surfaceCard) ||
    normalizeHex(palette.bgCanvas) ||
    (isDark ? '#111827' : '#ffffff');
  const accentText = ensureReadableAccentOnSurface(accent, surfaceSampleHex, 4.5);
  const accentHover = mixColors(accent, isDark ? '#ffffff' : '#000000', 0.85);
  const accentSoft = hexToRgba(accent, isDark ? 0.18 : 0.11);
  const accentBorder = hexToRgba(accent, isDark ? 0.44 : 0.30);

  // Shape / Radius
  const effectiveRadius =
    config.cardRadius !== null && config.cardRadius !== undefined
      ? config.cardRadius
      : fusedTokens?.defaultRadius ?? styleDef.defaultRadius;

  const buttonRadius =
    config.cardRadius !== null
      ? effectiveRadius === 0
        ? '0px'
        : styleDef.buttonRadius === '9999px'
        ? '9999px'
        : `${Math.max(4, Math.round(effectiveRadius * 0.65))}px`
      : styleDef.buttonRadius;

  const inputRadius =
    effectiveRadius === 0 ? '0px' : `${Math.max(4, Math.round(effectiveRadius * 0.6))}px`;

  const badgeRadius =
    effectiveRadius === 0
      ? '0px'
      : styleDef.badgeRadius === '9999px'
      ? '9999px'
      : `${Math.max(3, Math.round(effectiveRadius * 0.45))}px`;

  // Shadows
  let shadowCard = fusedTokens?.shadowCard || palette.shadowCard;
  let shadowElevated = fusedTokens?.shadowElevated || palette.shadowElevated;
  let shadowButton = palette.shadowButton;

  if (config.shadowIntensity !== 'auto') {
    if (config.shadowIntensity === 'none') {
      shadowCard = 'none';
      shadowElevated = isDark ? '0 0 0 1px rgba(255,255,255,0.16)' : '0 0 0 1px rgba(0,0,0,0.1)';
      shadowButton = 'none';
    } else if (config.shadowIntensity === 'subtle') {
      shadowCard = isDark
        ? '0 2px 8px rgba(0, 0, 0, 0.36)'
        : '0 1px 4px rgba(15, 23, 42, 0.08)';
      shadowElevated = isDark
        ? '0 8px 20px rgba(0, 0, 0, 0.48)'
        : '0 6px 16px rgba(15, 23, 42, 0.10)';
      shadowButton = isDark ? '0 2px 6px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.10)';
    } else if (config.shadowIntensity === 'elevated') {
      shadowCard = isDark
        ? `0 12px 30px -6px rgba(0, 0, 0, 0.62), 0 0 0 1px ${hexToRgba(accent, 0.14)}`
        : `0 10px 28px -6px rgba(15, 23, 42, 0.14), 0 4px 10px rgba(15, 23, 42, 0.06)`;
      shadowElevated = isDark
        ? '0 20px 44px -8px rgba(0, 0, 0, 0.72)'
        : '0 16px 38px -6px rgba(15, 23, 42, 0.18)';
      shadowButton = `0 6px 18px -4px ${hexToRgba(accent, 0.42)}`;
    } else if (config.shadowIntensity === 'dramatic') {
      shadowCard =
        styleDef.id === 'brutalism'
          ? `8px 8px 0px ${palette.borderStrong}`
          : styleDef.id === 'neumorphism'
          ? `11px 11px 24px ${palette.neuDark}, -11px -11px 24px ${palette.neuLight}`
          : isDark
          ? `0 22px 52px -10px rgba(0, 0, 0, 0.85), 0 0 28px -8px ${hexToRgba(accent, 0.30)}`
          : `0 20px 46px -10px rgba(15, 23, 42, 0.22), 0 6px 16px ${hexToRgba(accent, 0.14)}`;
      shadowElevated = isDark
        ? '0 28px 64px -10px rgba(0, 0, 0, 0.90)'
        : '0 26px 56px -10px rgba(15, 23, 42, 0.28)';
      shadowButton = `0 10px 26px -4px ${hexToRgba(accent, 0.55)}`;
    }
  }

  // Backdrop / Custom gradient
  let bgBackdrop = palette.bgBackdrop;
  if (config.gradientConfig) {
    bgBackdrop = generateGradientCss(config.gradientConfig);
  } else if (config.customGradient && config.customGradient !== 'auto') {
    const preset = BACKGROUND_GRADIENT_PRESETS.find((g) => g.id === config.customGradient);
    if (preset) {
      bgBackdrop = isDark ? preset.darkCss : preset.lightCss;
    } else {
      bgBackdrop = config.customGradient;
    }
  } else if (config.backgroundMode !== 'auto') {
    bgBackdrop = buildBackgroundCss(
      config.backgroundMode,
      palette.bgCanvas,
      accent,
      secondary,
      resolvedMode,
      palette.bgBackdrop
    );
  }

  // 3D Lighting & Depth tokens
  const threeD = config.threeDLighting || {};
  const ambientLight =
    threeD.ambientLightColor ||
    palTokens?.ambientLight ||
    hexToRgba(accent, isDark ? 0.28 : 0.20);
  const shadowTint =
    threeD.shadowColor ||
    palTokens?.shadowTint ||
    hexToRgba(isDark ? '#000000' : '#0f172a', isDark ? 0.70 : 0.16);
  const glassTint =
    threeD.glassTint || palTokens?.glassTint || hexToRgba(palette.surfaceCard, 0.75);
  const glowColor =
    threeD.glowColor || palTokens?.borderGlow || hexToRgba(accent, 0.50);
  const highlightColor =
    threeD.highlightColor ||
    palTokens?.highlight ||
    hexToRgba('#ffffff', isDark ? 0.18 : 0.35);
  const cardElevation =
    threeD.cardElevation !== undefined ? `${threeD.cardElevation}px` : '12px';
  const depthIntensity =
    threeD.depthIntensity !== undefined ? `${threeD.depthIntensity}%` : '100%';
  const glassBlur =
    threeD.glassBlur !== undefined
      ? `${threeD.glassBlur}px`
      : fusedTokens?.backdropBlur || styleDef.backdropBlur;
  const glassOpacity =
    threeD.glassOpacity !== undefined ? `${threeD.glassOpacity}` : '0.85';

  // Density
  const densityMap = {
    compact: {
      cardPad: '0.9rem',
      sectionGap: '1.15rem',
      gridGap: '0.75rem',
      rowPad: '0.625rem 0.9rem',
    },
    comfortable: {
      cardPad: '1.25rem',
      sectionGap: '1.75rem',
      gridGap: '1rem',
      rowPad: '0.875rem 1.15rem',
    },
    spacious: {
      cardPad: '1.65rem',
      sectionGap: '2.35rem',
      gridGap: '1.4rem',
      rowPad: '1.15rem 1.4rem',
    },
  }[config.density];

  // Animation duration
  const animMap = {
    none: { fast: '0ms', normal: '0ms', ease: 'linear' },
    subtle: { fast: '120ms', normal: '180ms', ease: 'ease-out' },
    standard: {
      fast: styleDef.id === 'brutalism' ? '50ms' : '160ms',
      normal: styleDef.id === 'brutalism' ? '80ms' : '260ms',
      ease:
        styleDef.id === 'claymorphism'
          ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
          : 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
    expressive: {
      fast: styleDef.id === 'brutalism' ? '70ms' : '200ms',
      normal: styleDef.id === 'brutalism' ? '120ms' : '380ms',
      ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  }[config.animationIntensity];

  // Hero surface adapts subtly if user sets custom accent on accent-driven styles
  const heroSurface =
    config.accentColor &&
    !['oled', 'editorial', 'minimalism'].includes(styleDef.id)
      ? styleDef.id === 'brutalism' || styleDef.id === 'flat'
        ? accent
        : `linear-gradient(135deg, ${accent} 0%, ${secondary} 100%)`
      : palette.surfaceHero;

  const heroText =
    config.accentColor &&
    (styleDef.id === 'brutalism' || styleDef.id === 'flat')
      ? accentContrast
      : palette.heroText;

  return {
    '--ff-bg-canvas': palette.bgCanvas,
    '--ff-bg-backdrop': bgBackdrop,
    '--ff-surface-card': palette.surfaceCard,
    '--ff-surface-elevated': palette.surfaceElevated,
    '--ff-surface-muted': palette.surfaceMuted,
    '--ff-surface-subtle': mixColors(palette.surfaceCard, palette.bgCanvas, isDark ? 0.35 : 0.25),
    '--ff-surface-inset': palette.surfaceInset,
    '--ff-surface-hover': palette.surfaceHover,
    '--ff-surface-sidebar': palette.surfaceSidebar,
    '--ff-surface-header': palette.surfaceHeader,
    '--ff-surface-hero': heroSurface,
    '--ff-hero-text': heroText,
    '--ff-hero-muted':
      config.accentColor && (styleDef.id === 'brutalism' || styleDef.id === 'flat')
        ? hexToRgba(heroText, 0.82)
        : palette.heroMuted,
    '--ff-text-primary': palette.textPrimary,
    '--ff-text-secondary': palette.textSecondary,
    '--ff-text-muted': palette.textMuted,
    '--ff-border-color': palette.borderColor,
    '--ff-border-strong': palette.borderStrong,
    '--ff-border-highlight': palette.borderHighlight,
    '--ff-border-width': fusedTokens?.borderWidth || styleDef.borderWidth,
    '--ff-backdrop-blur': glassBlur,
    '--ff-shadow-card': shadowCard,
    '--ff-shadow-elevated': shadowElevated,
    '--ff-shadow-button': shadowButton,
    '--ff-shadow-inset': palette.shadowInset || 'none',
    '--ff-neu-light': palette.neuLight,
    '--ff-neu-dark': palette.neuDark,
    '--ff-ambient-light': ambientLight,
    '--ff-shadow-tint': shadowTint,
    '--ff-glass-tint': glassTint,
    '--ff-glow-color': glowColor,
    '--ff-highlight-color': highlightColor,
    '--ff-card-elevation': cardElevation,
    '--ff-depth-intensity': depthIntensity,
    '--ff-glass-blur': glassBlur,
    '--ff-glass-opacity': glassOpacity,
    '--ff-card-bg': palette.surfaceCard,
    '--ff-border': palette.borderColor,
    '--ff-border-hover': palette.borderStrong,
    '--ff-muted': palette.surfaceMuted,
    '--ff-bg-primary': palette.bgCanvas,
    '--ff-bg-secondary': palette.surfaceCard,
    '--ff-accent': accent,
    '--ff-accent-secondary': secondary,
    '--ff-accent-hover': accentHover,
    '--ff-accent-soft': accentSoft,
    '--ff-accent-border': accentBorder,
    '--ff-accent-contrast': accentContrast,
    '--ff-accent-text': accentText,
    '--ff-success': palette.success,
    '--ff-success-soft': hexToRgba(palette.success, isDark ? 0.18 : 0.12),
    '--ff-warning': palette.warning,
    '--ff-warning-soft': hexToRgba(palette.warning, isDark ? 0.18 : 0.13),
    '--ff-danger': palette.danger,
    '--ff-danger-soft': hexToRgba(palette.danger, isDark ? 0.18 : 0.12),
    '--ff-info': palette.info,
    '--ff-info-soft': hexToRgba(palette.info, isDark ? 0.18 : 0.12),
    '--ff-font-display': fontDef.displayFont,
    '--ff-font-sans': fontDef.bodyFont,
    '--ff-font-mono': fontDef.monoFont,
    '--ff-font-scale': fontScaleVal,
    '--ff-heading-weight': styleDef.headingWeight,
    '--ff-heading-tracking': styleDef.headingTracking,
    '--ff-radius-card': `${effectiveRadius}px`,
    '--ff-radius-button': buttonRadius,
    '--ff-radius-input': inputRadius,
    '--ff-radius-badge': badgeRadius,
    '--ff-card-pad': densityMap.cardPad,
    '--ff-section-gap': densityMap.sectionGap,
    '--ff-grid-gap': densityMap.gridGap,
    '--ff-row-pad': densityMap.rowPad,
    '--ff-duration-fast': animMap.fast,
    '--ff-duration-normal': animMap.normal,
    '--ff-ease': animMap.ease,
  };
}

export function applyThemeToDocument(
  config: ThemeConfig,
  resolvedMode: 'light' | 'dark',
  persistCache = true
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // 1. Update data attributes for style-specific structural CSS rules
  root.setAttribute('data-design-style', config.styleId);
  root.setAttribute('data-theme-mode', resolvedMode);
  root.setAttribute('data-density', config.density);
  root.setAttribute('data-animation', config.animationIntensity);

  // 2. Sync <meta name="color-scheme"> and .dark class (Tailwind v4 + UA controls)
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute(
      'content',
      config.colorMode === 'system' ? 'light dark' : config.colorMode
    );
  }
  if (resolvedMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 3. Apply computed CSS custom properties to :root
  const vars = buildThemeCssVariables(config, resolvedMode);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  // 4. Persist lightweight anti-FOUC cache in localStorage
  if (persistCache) {
    try {
      localStorage.setItem(
        THEME_CACHE_KEY,
        JSON.stringify({
          config,
          colorSchemeMeta: config.colorMode === 'system' ? 'light dark' : config.colorMode,
          resolvedMode,
        })
      );
      localStorage.setItem(
        'color-scheme',
        config.colorMode === 'system' ? 'light dark' : config.colorMode
      );
    } catch {
      // ignore storage restrictions
    }
  }
}
