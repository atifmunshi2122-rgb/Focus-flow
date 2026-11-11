export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function normalizeHex(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return (
      '#' +
      cleaned
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return '#' + cleaned.toLowerCase();
  }
  return null;
}

export function parseHex(hex: string): RgbColor | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const intVal = parseInt(norm.slice(1), 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(99, 102, 241, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function mixColors(hexA: string, hexB: string, weightA = 0.5): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const w = Math.max(0, Math.min(1, weightA));
  return rgbToHex({
    r: a.r * w + b.r * (1 - w),
    g: a.g * w + b.g * (1 - w),
    b: a.b * w + b.b * (1 - w),
  });
}

function linearizeChannel(c255: number): number {
  const srgb = c255 / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const R = linearizeChannel(rgb.r);
  const G = linearizeChannel(rgb.g);
  const B = linearizeChannel(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getAccessibleContrastText(bgHex: string): '#09090b' | '#ffffff' {
  const darkText = '#09090b';
  const lightText = '#ffffff';
  const contrastDark = getContrastRatio(bgHex, darkText);
  const contrastLight = getContrastRatio(bgHex, lightText);
  return contrastDark >= contrastLight ? darkText : lightText;
}

/**
 * Ensures an accent color used for text/icons on a background surface meets
 * at least `minRatio` contrast (default 4.5:1 WCAG AA) by gently mixing toward
 * pure black or white only as much as needed.
 */
export function ensureReadableAccentOnSurface(
  accentHex: string,
  surfaceHex: string,
  minRatio = 4.5
): string {
  const normAccent = normalizeHex(accentHex) || '#6366f1';
  const normSurface = normalizeHex(surfaceHex) || '#ffffff';

  if (getContrastRatio(normAccent, normSurface) >= minRatio) {
    return normAccent;
  }

  const surfaceLum = getRelativeLuminance(normSurface);
  const targetMix = surfaceLum > 0.4 ? '#09090b' : '#ffffff';

  let low = 0;
  let high = 1;
  let best = targetMix;

  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    const candidate = mixColors(targetMix, normAccent, mid);
    if (getContrastRatio(candidate, normSurface) >= minRatio) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }

  return best;
}
