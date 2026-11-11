import { CuratedPalette, HarmonyType, PaletteTokens } from '../types/theme.ts';

export interface HSL {
  h: number; // 0 to 360
  s: number; // 0 to 100
  l: number; // 0 to 100
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function normalizeHex(hex: string): string {
  let cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return '#6366f1';
  }
  return `#${cleaned.toLowerCase()}`;
}

export function hexToRgb(hex: string): RGB {
  const norm = normalizeHex(hex).slice(1);
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hNorm = ((h % 360) + 360) % 360 / 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  let r: number, g: number, b: number;

  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };

    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getWcagRating(ratio: number): {
  badge: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  isAccessible: boolean;
  color: string;
} {
  if (ratio >= 7) {
    return { badge: 'AAA', isAccessible: true, color: '#10b981' };
  }
  if (ratio >= 4.5) {
    return { badge: 'AA', isAccessible: true, color: '#10b981' };
  }
  if (ratio >= 3) {
    return { badge: 'AA Large', isAccessible: true, color: '#f59e0b' };
  }
  return { badge: 'Fail', isAccessible: false, color: '#ef4444' };
}

export function ensureAccessibleContrast(
  fgHex: string,
  bgHex: string,
  targetRatio = 4.5
): string {
  const currentRatio = getContrastRatio(fgHex, bgHex);
  if (currentRatio >= targetRatio) return fgHex;

  const bgLum = getRelativeLuminance(bgHex);
  const fgHsl = hexToHsl(fgHex);
  const shouldLighten = bgLum < 0.5;

  let bestHex = fgHex;
  let bestRatio = currentRatio;

  for (let delta = 1; delta <= 50; delta++) {
    const nextL = shouldLighten
      ? Math.min(100, fgHsl.l + delta)
      : Math.max(0, fgHsl.l - delta);
    const candidateHex = hslToHex(fgHsl.h, fgHsl.s, nextL);
    const ratio = getContrastRatio(candidateHex, bgHex);
    if (ratio >= targetRatio) {
      return candidateHex;
    }
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestHex = candidateHex;
    }
  }

  return shouldLighten ? '#ffffff' : '#000000';
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

export function mixColors(hexA: string, hexB: string, weightA = 0.5): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  const r = Math.round(a.r * w + b.r * (1 - w));
  const g = Math.round(a.g * w + b.g * (1 - w));
  const bVal = Math.round(a.b * w + b.b * (1 - w));
  return rgbToHex(r, g, bVal);
}

// ============================================================================
// COLOR HARMONY CALCULATIONS
// ============================================================================

export function generateHarmonicPalette(baseHex: string, type: HarmonyType): string[] {
  const { h, s, l } = hexToHsl(baseHex);

  switch (type) {
    case 'complementary': {
      const compHue = (h + 180) % 360;
      return [
        baseHex,
        hslToHex(compHue, s, l),
        hslToHex(h, Math.max(15, s - 25), Math.min(92, l + 25)),
        hslToHex(compHue, Math.max(20, s - 10), Math.max(18, l - 15)),
      ];
    }
    case 'analogous': {
      const h1 = (h + 30) % 360;
      const h2 = (h + 330) % 360;
      return [
        baseHex,
        hslToHex(h1, s, l),
        hslToHex(h2, s, l),
        hslToHex((h + 60) % 360, Math.max(20, s - 15), Math.min(85, l + 15)),
      ];
    }
    case 'triadic': {
      const h1 = (h + 120) % 360;
      const h2 = (h + 240) % 360;
      return [
        baseHex,
        hslToHex(h1, s, l),
        hslToHex(h2, s, l),
        hslToHex(h, Math.max(20, s - 20), Math.min(90, l + 20)),
      ];
    }
    case 'split-complementary': {
      const h1 = (h + 150) % 360;
      const h2 = (h + 210) % 360;
      return [
        baseHex,
        hslToHex(h1, s, l),
        hslToHex(h2, s, l),
        hslToHex((h + 180) % 360, Math.max(25, s - 15), Math.min(88, l + 18)),
      ];
    }
    case 'tetradic': {
      const h1 = (h + 90) % 360;
      const h2 = (h + 180) % 360;
      const h3 = (h + 270) % 360;
      return [
        baseHex,
        hslToHex(h1, s, l),
        hslToHex(h2, s, l),
        hslToHex(h3, s, l),
      ];
    }
    case 'monochromatic': {
      return [
        hslToHex(h, s, Math.min(94, l + 32)),
        hslToHex(h, s, Math.min(85, l + 16)),
        baseHex,
        hslToHex(h, s, Math.max(15, l - 16)),
        hslToHex(h, Math.max(20, s - 15), Math.max(8, l - 32)),
      ];
    }
    default:
      return [baseHex];
  }
}

// ============================================================================
// FULL UNIFIED PALETTE GENERATOR (FROM SEED COLOR)
// ============================================================================

export function generateFullThemeFromColor(
  baseHex: string,
  isDark: boolean = true,
  paletteName?: string
): CuratedPalette {
  const normBase = normalizeHex(baseHex);
  const { h, s } = hexToHsl(normBase);

  // Compute harmonic accents
  const secondaryHue = (h + 40) % 360;
  const secondary = hslToHex(secondaryHue, Math.min(95, s + 5), isDark ? 65 : 45);
  const accent = normBase;

  // Background and surface calculations
  let bgCanvas: string;
  let bgBackdrop: string;
  let surfaceCard: string;
  let surfaceElevated: string;
  let surfaceMuted: string;
  let surfaceInset: string;
  let borderColor: string;
  let borderGlow: string;
  let textPrimary: string;
  let textSecondary: string;
  let textMuted: string;
  let ambientLight: string;
  let shadowTint: string;
  let glassTint: string;
  let highlight: string;

  if (isDark) {
    // Dark tone tuned to base hue
    bgCanvas = hslToHex(h, Math.min(25, Math.round(s * 0.28)), 6);
    surfaceCard = hslToHex(h, Math.min(28, Math.round(s * 0.32)), 10);
    surfaceElevated = hslToHex(h, Math.min(30, Math.round(s * 0.36)), 14);
    surfaceMuted = hslToHex(h, Math.min(20, Math.round(s * 0.25)), 12);
    surfaceInset = hslToHex(h, Math.min(22, Math.round(s * 0.28)), 7);

    borderColor = hexToRgba(accent, 0.24);
    borderGlow = hexToRgba(accent, 0.45);
    textPrimary = '#fafafa';
    textSecondary = hslToHex(h, 15, 84);
    textMuted = hslToHex(h, 20, 64);

    ambientLight = hexToRgba(accent, 0.22);
    shadowTint = hexToRgba('#000000', 0.65);
    glassTint = hexToRgba(surfaceCard, 0.72);
    highlight = hexToRgba('#ffffff', 0.16);

    bgBackdrop = `radial-gradient(at 15% 15%, ${hexToRgba(accent, 0.25)} 0px, transparent 50%), radial-gradient(at 85% 20%, ${hexToRgba(secondary, 0.20)} 0px, transparent 50%), ${bgCanvas}`;
  } else {
    // Light tone tuned to base hue
    bgCanvas = hslToHex(h, Math.min(25, Math.round(s * 0.25)), 97);
    surfaceCard = '#ffffff';
    surfaceElevated = hslToHex(h, Math.min(30, Math.round(s * 0.30)), 95);
    surfaceMuted = hslToHex(h, Math.min(20, Math.round(s * 0.22)), 92);
    surfaceInset = hslToHex(h, Math.min(22, Math.round(s * 0.25)), 95);

    borderColor = hslToHex(h, 20, 85);
    borderGlow = hexToRgba(accent, 0.35);
    textPrimary = hslToHex(h, 30, 12);
    textSecondary = hslToHex(h, 25, 26);
    textMuted = hslToHex(h, 20, 45);

    ambientLight = hexToRgba(accent, 0.14);
    shadowTint = hexToRgba(hslToHex(h, 30, 20), 0.12);
    glassTint = hexToRgba('#ffffff', 0.82);
    highlight = hexToRgba('#ffffff', 0.85);

    bgBackdrop = `radial-gradient(at 15% 15%, ${hexToRgba(accent, 0.18)} 0px, transparent 50%), radial-gradient(at 85% 20%, ${hexToRgba(secondary, 0.14)} 0px, transparent 50%), ${bgCanvas}`;
  }

  // Ensure high-contrast readable text on primary accent
  textPrimary = ensureAccessibleContrast(textPrimary, bgCanvas, 7);

  const tokens: PaletteTokens = {
    primary: normBase,
    secondary,
    accent,
    bgCanvas,
    bgBackdrop,
    surfaceCard,
    surfaceElevated,
    surfaceMuted,
    surfaceInset,
    borderColor,
    borderGlow,
    textPrimary,
    textSecondary,
    textMuted,
    ambientLight,
    shadowTint,
    glassTint,
    highlight,
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#0ea5e9',
  };

  const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const title = paletteName || `Harmonic ${normBase.toUpperCase()}`;

  return {
    id,
    name: title,
    category: isDark ? 'dark-luxury' : 'light-minimal',
    categoryLabel: isDark ? 'Dark Luxury' : 'Light Minimal',
    description: `Algorithmic harmonic theme calibrated from seed ${normBase}`,
    isDark,
    tags: ['Harmonic', 'Calibrated', isDark ? 'Dark' : 'Light'],
    tokens,
    gradientStops: [
      { color: normBase, position: 0 },
      { color: secondary, position: 100 },
    ],
  };
}

// Random curated harmonic generator
export function generateRandomHarmonicPalette(isDark = true): CuratedPalette {
  const randomHue = Math.floor(Math.random() * 360);
  const randomSat = Math.floor(65 + Math.random() * 30); // 65-95%
  const randomLight = isDark
    ? Math.floor(55 + Math.random() * 15) // 55-70% for dark mode accents
    : Math.floor(40 + Math.random() * 15); // 40-55% for light mode accents

  const seedHex = hslToHex(randomHue, randomSat, randomLight);
  const names = [
    'Solar Flare',
    'Nebula Drift',
    'Quantum Horizon',
    'Cyber Prism',
    'Opaline Dream',
    'Titanium Spark',
    'Bioluminescent Wave',
    'Zenith Ray',
    'Obsidian Ember',
    'Velvet Eclipse',
    'Radiant Mirage',
    'Prismatic Pulse',
  ];
  const name = names[Math.floor(Math.random() * names.length)];
  return generateFullThemeFromColor(seedHex, isDark, `${name} #${randomHue}°`);
}

export interface AiPaletteSuggestion {
  name: string;
  seed: string;
  harmony: HarmonyType;
  description: string;
}

export function generateAiPaletteSuggestions(
  seedHex: string,
  mood: 'focus' | 'calm' | 'vibrant' | 'luxury' = 'focus'
): AiPaletteSuggestion[] {
  const { h, s, l } = hexToHsl(seedHex);
  void mood;
  return [
    {
      name: 'Deep Focus Pro',
      seed: hslToHex((h + 10) % 360, Math.min(80, s + 10), Math.max(45, Math.min(65, l))),
      harmony: 'analogous',
      description: 'Cognitive flow state with low fatigue hues',
    },
    {
      name: 'Executive Wealth',
      seed: hslToHex(142, 70, 48),
      harmony: 'triadic',
      description: 'Prosperity green with sovereign dark depth',
    },
    {
      name: 'Cyber Aura 3D',
      seed: hslToHex((h + 180) % 360, 90, 58),
      harmony: 'complementary',
      description: 'High dynamic range with luminous contrast',
    },
  ];
}
