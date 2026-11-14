import {
  ModePalette,
  StyleFusionConfig,
} from '../types/theme.ts';
import { getStyleDefinition } from './stylesRegistry.ts';
import { hexToRgba, mixColors, normalizeHex } from './colorUtils.ts';

export const DEFAULT_FUSION_CONFIG: StyleFusionConfig = {
  primaryStyleId: 'claymorphism',
  secondaryStyleId: 'glassmorphism',
  blendRatio: 50,
  translucency: 65,
  inflation: 75,
  blur: 18,
  borderSpecularity: 80,
  shadowWeight: 60,
  springFactor: 85,
};

export interface FusionPresetTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  config: StyleFusionConfig;
  previewColors: [string, string, string];
}

export const FUSION_PRESET_TEMPLATES: FusionPresetTemplate[] = [
  {
    id: 'glazed_clay',
    name: 'Glazed Clay 3D',
    tagline: 'Frosted translucent glass with 3D inflated pillowy cushions',
    description:
      'The ultimate synthesis of Glassmorphism & Claymorphism: luminous translucent surfaces with deep double inner bevel highlights and springy physics.',
    config: {
      primaryStyleId: 'claymorphism',
      secondaryStyleId: 'glassmorphism',
      blendRatio: 50,
      translucency: 68,
      inflation: 80,
      blur: 18,
      borderSpecularity: 85,
      shadowWeight: 65,
      springFactor: 90,
    },
    previewColors: ['#6366f1', '#ec4899', '#06b6d4'],
  },
  {
    id: 'cyber_glass',
    name: 'Cyber Glass HUD',
    tagline: 'Dark translucent obsidian glass with electric neon telemetry',
    description:
      'Dark obsidian frosted glass with sharp angular scanline HUD grids and radiant electric cyan/magenta telemetry glow.',
    config: {
      primaryStyleId: 'cyberpunk',
      secondaryStyleId: 'glassmorphism',
      blendRatio: 45,
      translucency: 80,
      inflation: 20,
      blur: 16,
      borderSpecularity: 95,
      shadowWeight: 50,
      springFactor: 40,
    },
    previewColors: ['#00f0ff', '#ff2a85', '#0f172a'],
  },
  {
    id: 'soft_glass',
    name: 'Soft Neumorphic Glass',
    tagline: 'Extruded continuous tactile base with frosted acrylic overlay',
    description:
      'Opposing soft directional shadow vectors push cards out of the canvas, while frosted acrylic surfaces add crystalline clarity.',
    config: {
      primaryStyleId: 'neumorphism',
      secondaryStyleId: 'glassmorphism',
      blendRatio: 50,
      translucency: 60,
      inflation: 55,
      blur: 14,
      borderSpecularity: 70,
      shadowWeight: 70,
      springFactor: 60,
    },
    previewColors: ['#6366f1', '#a855f7', '#e2e8f0'],
  },
  {
    id: 'aurora_clay',
    name: 'Aurora Clay Flow',
    tagline: 'Tactile inflated cushions drifting over Northern Lights mesh',
    description:
      'Plump 3D clay cards bathed in atmospheric emerald, cyan, and violet aurora ambient illumination.',
    config: {
      primaryStyleId: 'claymorphism',
      secondaryStyleId: 'aurora',
      blendRatio: 50,
      translucency: 50,
      inflation: 85,
      blur: 20,
      borderSpecularity: 75,
      shadowWeight: 60,
      springFactor: 85,
    },
    previewColors: ['#10b981', '#6366f1', '#8b5cf6'],
  },
  {
    id: 'metallic_brutal',
    name: 'Skeuo-Brutalist Alloy',
    tagline: 'Machined brushed alloy with raw 0px hard offset drop shadow blocks',
    description:
      'Real hardware bevels and brushed metal textures framed with thick ink borders and mechanical snap.',
    config: {
      primaryStyleId: 'brutalism',
      secondaryStyleId: 'skeuomorphism',
      blendRatio: 40,
      translucency: 0,
      inflation: 40,
      blur: 0,
      borderSpecularity: 60,
      shadowWeight: 90,
      springFactor: 20,
    },
    previewColors: ['#facc15', '#0a0a0a', '#94a3b8'],
  },
];

export function computeFusedTokens(
  fusion: StyleFusionConfig,
  resolvedMode: 'light' | 'dark'
): Partial<ModePalette> & {
  backdropBlur: string;
  defaultRadius: number;
  borderWidth: string;
} {
  const primaryDef = getStyleDefinition(fusion.primaryStyleId);
  const secondaryDef = getStyleDefinition(fusion.secondaryStyleId);
  const isDark = resolvedMode === 'dark';

  const pPalette = isDark ? primaryDef.dark : primaryDef.light;
  const sPalette = isDark ? secondaryDef.dark : secondaryDef.light;

  const tFactor = Math.max(0, Math.min(100, fusion.translucency)) / 100;
  const iFactor = Math.max(0, Math.min(100, fusion.inflation)) / 100;
  const sFactor = Math.max(0, Math.min(100, fusion.shadowWeight)) / 100;
  const specFactor = Math.max(0, Math.min(100, fusion.borderSpecularity)) / 100;
  const ratio = Math.max(0, Math.min(100, fusion.blendRatio)) / 100;

  // 1. Translucent Surface Card
  const baseCardColor = mixColors(
    normalizeHex(pPalette.surfaceCard) || (isDark ? '#1a1d2e' : '#ffffff'),
    normalizeHex(sPalette.surfaceCard) || (isDark ? '#0f172a' : '#ffffff'),
    1 - ratio
  );
  const cardOpacity = Math.max(0.25, Math.min(0.98, 1 - tFactor * 0.55));
  const surfaceCard = hexToRgba(baseCardColor, cardOpacity);
  const surfaceElevated = hexToRgba(baseCardColor, Math.min(1, cardOpacity + 0.15));

  // 2. Double inner bevels + outer elevation shadow
  const rimLight = isDark
    ? `rgba(255, 255, 255, ${0.12 + specFactor * 0.22})`
    : `rgba(255, 255, 255, ${0.65 + specFactor * 0.32})`;
  const innerDark = isDark
    ? `rgba(0, 0, 0, ${0.35 + iFactor * 0.35})`
    : `rgba(99, 102, 241, ${0.12 + iFactor * 0.22})`;

  const innerLightOffset = Math.round(3 + iFactor * 4);
  const innerDarkOffset = Math.round(4 + iFactor * 5);
  const outerSpread = Math.round(8 + sFactor * 24);

  const shadowCard = `${Math.round(8 * sFactor)}px ${Math.round(14 * sFactor)}px ${outerSpread}px ${
    isDark ? 'rgba(0,0,0,0.48)' : 'rgba(99,102,241,0.14)'
  }, inset ${innerLightOffset}px ${innerLightOffset}px ${innerLightOffset * 2}px ${rimLight}, inset -${innerDarkOffset}px -${innerDarkOffset}px ${innerDarkOffset * 2}px ${innerDark}`;

  const shadowElevated = `${Math.round(14 * sFactor)}px ${Math.round(22 * sFactor)}px ${
    outerSpread + 10
  }px ${
    isDark ? 'rgba(0,0,0,0.60)' : 'rgba(99,102,241,0.22)'
  }, inset ${innerLightOffset + 2}px ${innerLightOffset + 2}px ${innerLightOffset * 2}px ${rimLight}`;

  // 3. Interpolated radius & border
  const blendedRadius = Math.round(
    primaryDef.defaultRadius * (1 - ratio) + secondaryDef.defaultRadius * ratio
  );
  const effectiveRadius = Math.round(blendedRadius * (0.6 + iFactor * 0.5));
  const borderWidth = `${Math.max(1, Math.round(1 + iFactor * 1))}px`;
  const backdropBlur = `${Math.round(fusion.blur)}px`;

  return {
    surfaceCard,
    surfaceElevated,
    shadowCard,
    shadowElevated,
    backdropBlur,
    defaultRadius: Math.max(0, Math.min(32, effectiveRadius)),
    borderWidth,
    borderColor: hexToRgba(isDark ? '#ffffff' : '#ffffff', isDark ? 0.16 + specFactor * 0.15 : 0.65 + specFactor * 0.3),
    borderStrong: pPalette.borderStrong || sPalette.borderStrong,
  };
}
