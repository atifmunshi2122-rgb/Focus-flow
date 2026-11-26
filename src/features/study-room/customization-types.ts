/**
 * FocusFlow & Finance — Study Room Customization Types, Validation & 3D Theme Palettes
 */

export type RoomTheme =
  | 'cozy'
  | 'minimal'
  | 'academia'
  | 'neon'
  | 'sakura'
  | 'midnight';

export type RoomWeather = 'clear' | 'rain' | 'snow';

export type RoomLighting = 'morning' | 'afternoon' | 'sunset' | 'night' | 'auto';

export type DeskStyle = 'wood' | 'modern' | 'dark' | 'neon';

export type ChairStyle = 'modern' | 'gaming' | 'classic';

export interface RoomCustomization {
  theme: RoomTheme;
  weather: RoomWeather;
  lighting: RoomLighting;
  deskStyle: DeskStyle;
  chairStyle: ChairStyle;
  showPlants: boolean;
  showDecorations: boolean;
  ambientEffects: boolean;
}

export const defaultRoomCustomization: RoomCustomization = {
  theme: 'cozy',
  weather: 'clear',
  lighting: 'afternoon',
  deskStyle: 'wood',
  chairStyle: 'modern',
  showPlants: true,
  showDecorations: true,
  ambientEffects: true,
};

const VALID_THEMES: readonly RoomTheme[] = [
  'cozy',
  'minimal',
  'academia',
  'neon',
  'sakura',
  'midnight',
];
const VALID_WEATHERS: readonly RoomWeather[] = ['clear', 'rain', 'snow'];
const VALID_LIGHTINGS: readonly RoomLighting[] = [
  'morning',
  'afternoon',
  'sunset',
  'night',
  'auto',
];
const VALID_DESK_STYLES: readonly DeskStyle[] = ['wood', 'modern', 'dark', 'neon'];
const VALID_CHAIR_STYLES: readonly ChairStyle[] = ['modern', 'gaming', 'classic'];

export function sanitizeRoomCustomization(raw: unknown): RoomCustomization {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...defaultRoomCustomization };
  }
  const obj = raw as Record<string, unknown>;
  return {
    theme: VALID_THEMES.includes(obj.theme as RoomTheme)
      ? (obj.theme as RoomTheme)
      : defaultRoomCustomization.theme,
    weather: VALID_WEATHERS.includes(obj.weather as RoomWeather)
      ? (obj.weather as RoomWeather)
      : defaultRoomCustomization.weather,
    lighting: VALID_LIGHTINGS.includes(obj.lighting as RoomLighting)
      ? (obj.lighting as RoomLighting)
      : defaultRoomCustomization.lighting,
    deskStyle: VALID_DESK_STYLES.includes(obj.deskStyle as DeskStyle)
      ? (obj.deskStyle as DeskStyle)
      : defaultRoomCustomization.deskStyle,
    chairStyle: VALID_CHAIR_STYLES.includes(obj.chairStyle as ChairStyle)
      ? (obj.chairStyle as ChairStyle)
      : defaultRoomCustomization.chairStyle,
    showPlants:
      typeof obj.showPlants === 'boolean' ? obj.showPlants : defaultRoomCustomization.showPlants,
    showDecorations:
      typeof obj.showDecorations === 'boolean'
        ? obj.showDecorations
        : defaultRoomCustomization.showDecorations,
    ambientEffects:
      typeof obj.ambientEffects === 'boolean'
        ? obj.ambientEffects
        : defaultRoomCustomization.ambientEffects,
  };
}

export interface RoomThemePalette {
  label: string;
  floorColor: string;
  plinthColor: string;
  rugColor: string;
  backWallColor: string;
  sideWallColor: string;
  curtainColor: string;
  accentStripColor: string;
  poufColor: string;
  posterColor: string;
  bgHex: string;
}

export const ROOM_THEME_PALETTES: Record<RoomTheme, RoomThemePalette> = {
  cozy: {
    label: 'Cozy Anime',
    floorColor: '#36324a',
    plinthColor: '#232036',
    rugColor: '#433454',
    backWallColor: '#3b3754',
    sideWallColor: '#312d47',
    curtainColor: '#6366f1',
    accentStripColor: '#a78bfa',
    poufColor: '#7c3aed',
    posterColor: '#818cf8',
    bgHex: '#17192b',
  },
  minimal: {
    label: 'Modern Minimal',
    floorColor: '#d6d3d1',
    plinthColor: '#a8a29e',
    rugColor: '#e7e5e4',
    backWallColor: '#f5f5f4',
    sideWallColor: '#e7e5e4',
    curtainColor: '#64748b',
    accentStripColor: '#38bdf8',
    poufColor: '#94a3b8',
    posterColor: '#0ea5e9',
    bgHex: '#1e293b',
  },
  academia: {
    label: 'Dark Academia',
    floorColor: '#3b2c25',
    plinthColor: '#241a15',
    rugColor: '#581c2c',
    backWallColor: '#2e2421',
    sideWallColor: '#261d1a',
    curtainColor: '#7f1d1d',
    accentStripColor: '#f59e0b',
    poufColor: '#881337',
    posterColor: '#b45309',
    bgHex: '#161110',
  },
  neon: {
    label: 'Neon Gaming',
    floorColor: '#131629',
    plinthColor: '#0b0d1a',
    rugColor: '#1e1b4b',
    backWallColor: '#161932',
    sideWallColor: '#111428',
    curtainColor: '#ec4899',
    accentStripColor: '#22d3ee',
    poufColor: '#db2777',
    posterColor: '#a855f7',
    bgHex: '#090b16',
  },
  sakura: {
    label: 'Sakura Garden',
    floorColor: '#4a3a45',
    plinthColor: '#33262f',
    rugColor: '#fbcfe8',
    backWallColor: '#543f4d',
    sideWallColor: '#473441',
    curtainColor: '#f472b6',
    accentStripColor: '#f9a8d4',
    poufColor: '#ec4899',
    posterColor: '#fb7185',
    bgHex: '#1e151d',
  },
  midnight: {
    label: 'Midnight Study',
    floorColor: '#1e253b',
    plinthColor: '#121728',
    rugColor: '#1e3a5f',
    backWallColor: '#1b2238',
    sideWallColor: '#151b2e',
    curtainColor: '#3b82f6',
    accentStripColor: '#818cf8',
    poufColor: '#4338ca',
    posterColor: '#6366f1',
    bgHex: '#0b1020',
  },
};

