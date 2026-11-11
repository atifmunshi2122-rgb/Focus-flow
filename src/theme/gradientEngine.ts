import { GradientConfig, GradientStop, GradientType } from '../types/theme.ts';
import { hexToRgba } from './colorHarmonyEngine.ts';

export const GRADIENT_PRESETS: Array<{
  id: string;
  name: string;
  type: GradientType;
  angle: number;
  stops: GradientStop[];
  description: string;
}> = [
  {
    id: 'deep_galaxy',
    name: 'Midnight Galaxy',
    type: 'linear',
    angle: 135,
    stops: [
      { id: '1', color: '#090a15', position: 0 },
      { id: '2', color: '#1a103c', position: 50 },
      { id: '3', color: '#032338', position: 100 },
    ],
    description: 'Deep cosmic violet with stellar cyan horizon',
  },
  {
    id: 'aurora_borealis',
    name: 'Nordic Aurora',
    type: 'aurora',
    angle: 145,
    stops: [
      { id: '1', color: '#021814', position: 0 },
      { id: '2', color: '#10b981', position: 35 },
      { id: '3', color: '#06b6d4', position: 70 },
      { id: '4', color: '#6366f1', position: 100 },
    ],
    description: 'Ethereal emerald and indigo ionospheric veil',
  },
  {
    id: 'cyber_neon',
    name: 'Cyberpunk Neon',
    type: 'linear',
    angle: 125,
    stops: [
      { id: '1', color: '#070913', position: 0 },
      { id: '2', color: '#ff007f', position: 52 },
      { id: '3', color: '#00f0ff', position: 100 },
    ],
    description: 'High-voltage electric magenta and hyper-cyan',
  },
  {
    id: 'liquid_sunset',
    name: 'Liquid Sunset',
    type: 'radial',
    angle: 180,
    stops: [
      { id: '1', color: '#ff6b4a', position: 0 },
      { id: '2', color: '#db2777', position: 48 },
      { id: '3', color: '#1e0b24', position: 100 },
    ],
    description: 'Warm glowing solar orb dispersing into velvet plum',
  },
  {
    id: 'metallic_titanium',
    name: '3D Titanium Chrome',
    type: 'metallic',
    angle: 90,
    stops: [
      { id: '1', color: '#1e2430', position: 0 },
      { id: '2', color: '#4b5563', position: 30 },
      { id: '3', color: '#9ca3af', position: 50 },
      { id: '4', color: '#374151', position: 75 },
      { id: '5', color: '#111827', position: 100 },
    ],
    description: 'Brushed specular aerospace titanium with directional gleam',
  },
  {
    id: 'emerald_matrix',
    name: 'Emerald Wealth',
    type: 'mesh',
    angle: 135,
    stops: [
      { id: '1', color: '#022c22', position: 0 },
      { id: '2', color: '#059669', position: 40 },
      { id: '3', color: '#14b8a6', position: 80 },
      { id: '4', color: '#0f172a', position: 100 },
    ],
    description: 'Rich sovereign green tones with mint specular depth',
  },
  {
    id: 'royal_amethyst',
    name: 'Royal Amethyst',
    type: 'linear',
    angle: 160,
    stops: [
      { id: '1', color: '#180728', position: 0 },
      { id: '2', color: '#6d28d9', position: 55 },
      { id: '3', color: '#d946ef', position: 100 },
    ],
    description: 'Imperial jewel purple with luminous fuchsia edge',
  },
  {
    id: 'conic_prism',
    name: 'Conic Spectrum 3D',
    type: 'conic',
    angle: 0,
    stops: [
      { id: '1', color: '#4f46e5', position: 0 },
      { id: '2', color: '#06b6d4', position: 33 },
      { id: '3', color: '#ec4899', position: 66 },
      { id: '4', color: '#4f46e5', position: 100 },
    ],
    description: 'Rotating radar spectrum 360-degree sweep',
  },
];

export function generateGradientCss(config: GradientConfig): string {
  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position);
  const stopString = sortedStops
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');

  switch (config.type) {
    case 'linear':
      return `linear-gradient(${config.angle}deg, ${stopString})`;
    case 'radial':
      return `radial-gradient(circle at 50% 40%, ${stopString})`;
    case 'conic':
      return `conic-gradient(from ${config.angle}deg at 50% 50%, ${stopString})`;
    case 'mesh': {
      const c1 = sortedStops[0]?.color || '#4f46e5';
      const c2 = sortedStops[1]?.color || '#06b6d4';
      const c3 = sortedStops[2]?.color || '#ec4899';
      const bg = sortedStops[sortedStops.length - 1]?.color || '#090a15';
      return `radial-gradient(at 15% 18%, ${hexToRgba(c1, 0.45)} 0px, transparent 52%), radial-gradient(at 85% 15%, ${hexToRgba(c2, 0.40)} 0px, transparent 50%), radial-gradient(at 50% 88%, ${hexToRgba(c3, 0.35)} 0px, transparent 55%), ${bg}`;
    }
    case 'aurora': {
      const c1 = sortedStops[0]?.color || '#10b981';
      const c2 = sortedStops[1]?.color || '#6366f1';
      const c3 = sortedStops[2]?.color || '#06b6d4';
      const bg = sortedStops[sortedStops.length - 1]?.color || '#021814';
      return `radial-gradient(ellipse 70% 55% at 20% 20%, ${hexToRgba(c1, 0.38)} 0%, transparent 60%), radial-gradient(ellipse 70% 55% at 80% 25%, ${hexToRgba(c2, 0.35)} 0%, transparent 60%), radial-gradient(ellipse 65% 50% at 50% 85%, ${hexToRgba(c3, 0.30)} 0%, transparent 60%), ${bg}`;
    }
    case 'metallic':
      return `linear-gradient(${config.angle}deg, ${sortedStops.map((s) => `${s.color} ${s.position}%`).join(', ')})`;
    case 'animated':
      return `linear-gradient(${config.angle}deg, ${stopString})`;
    default:
      return `linear-gradient(${config.angle}deg, ${stopString})`;
  }
}

export const GRADIENT_TYPE_LABELS: Record<GradientType, string> = {
  linear: 'Linear Flow',
  radial: 'Radial Bloom',
  conic: 'Conic Prism 3D',
  mesh: 'Multi-Stop Mesh',
  aurora: 'Aurora Ambient',
  metallic: '3D Specular Metallic',
  animated: 'Animated Shimmer',
};

export const GRADIENT_PRESET_TEMPLATES: GradientConfig[] = GRADIENT_PRESETS.map((p) => ({
  name: p.name,
  type: p.type,
  angle: p.angle,
  stops: p.stops,
  animated: false,
}));
