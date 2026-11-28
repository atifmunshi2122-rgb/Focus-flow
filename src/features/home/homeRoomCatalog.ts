import type { HomeZoneId } from './homeRoutineEngine.ts';
import type { FurnitureShortcutId } from './homeFeaturesEngine.ts';

export type HomeRoomStyle =
  | 'classic'
  | 'anime_studio'
  | 'cozy_villa'
  | 'neon_gaming'
  | 'royal_palace';

export type GlbInteractionTarget =
  | { type: 'zone'; zone: HomeZoneId }
  | { type: 'furniture'; shortcut: FurnitureShortcutId }
  | { type: 'floor' };

export interface HomeZoneOverride {
  anchorPosition: [number, number, number];
  approachPosition: [number, number, number];
  targetRotationY: number;
}

export interface HomeRoomObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  pushAxis?: 'nearest' | 'z_front';
}

export interface HomeRoomLayoutConfig {
  zoneOverrides?: Partial<Record<HomeZoneId, HomeZoneOverride>>;
  standingDeskPos?: [number, number, number];
  walkBounds?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  obstacles?: ReadonlyArray<HomeRoomObstacleBox>;
}

export interface HomeRoomThemeConfig {
  id: HomeRoomStyle;
  label: string;
  unlockLevel: number;
  kind: 'procedural' | 'glb';
  glbUrl?: string;
  scale?: number;
  offset?: [number, number, number];
  plinth?: {
    position: [number, number, number];
    size: [number, number, number];
    color?: string;
  };
  animateClockAndCanopy?: boolean;
  interactionMap?: Record<string, GlbInteractionTarget>;
  roomLayout?: HomeRoomLayoutConfig;
  toastMessage: string;
}

/**
 * Central scalable catalog of My Home 3D room themes.
 * Adding a new .glb room only requires adding 1 entry here and dropping the .glb into public/models/.
 */
export const HOME_ROOM_CATALOG: ReadonlyArray<HomeRoomThemeConfig> = [
  {
    id: 'classic',
    label: 'Classic',
    unlockLevel: 1,
    kind: 'procedural',
    roomLayout: {
      standingDeskPos: [-3.68, 0, 1.05],
      walkBounds: { minX: -3.65, maxX: 2.45, minZ: -2.75, maxZ: 2.45 },
      obstacles: [
        { minX: -2.95, maxX: -1.32, minZ: -3.35, maxZ: -1.12, pushAxis: 'z_front' },
        { minX: -0.78, maxX: 0.48, minZ: 0.32, maxZ: 1.58 },
      ],
    },
    toastMessage: '🏠 Switched to Classic Apartment!',
  },
  {
    id: 'anime_studio',
    label: 'Anime Studio',
    unlockLevel: 3,
    kind: 'glb',
    glbUrl: '/models/anime-studio-room.glb',
    scale: 0.78,
    offset: [-2.41, -0.047, -3.46],
    plinth: {
      position: [0, -0.34, 0],
      size: [6.4, 0.36, 10.1],
      color: '#162040',
    },
    interactionMap: {
      Floor: { type: 'floor' },
      Window: { type: 'furniture', shortcut: 'window_speaker' },
      Laptop: { type: 'furniture', shortcut: 'laptop' },
      CorkboardHeadphones: { type: 'furniture', shortcut: 'wall_schedule' },
      StudyShelves: { type: 'furniture', shortcut: 'wall_schedule' },
      Desk: { type: 'zone', zone: 'study' },
      OfficeChair: { type: 'zone', zone: 'study' },
      DeskItems: { type: 'zone', zone: 'study' },
      Bed: { type: 'zone', zone: 'bedroom' },
      Nightstand: { type: 'zone', zone: 'bedroom' },
      Kitchen: { type: 'zone', zone: 'kitchen' },
      DiningTable: { type: 'zone', zone: 'dining' },
      DiningChair: { type: 'zone', zone: 'dining' },
      Bathroom: { type: 'zone', zone: 'washroom' },
    },
    roomLayout: {
      zoneOverrides: {
        study: {
          anchorPosition: [-0.78, 0, 2.92],
          approachPosition: [-0.15, 0, 2.92],
          targetRotationY: -Math.PI / 2,
        },
        bedroom: {
          anchorPosition: [-1.64, 0.45, -0.57],
          approachPosition: [-0.15, 0, -0.57],
          targetRotationY: 0,
        },
        kitchen: {
          anchorPosition: [-0.55, 0, -2.85],
          approachPosition: [-0.55, 0, -2.15],
          targetRotationY: Math.PI,
        },
        dining: {
          anchorPosition: [0.65, 0, 0.19],
          approachPosition: [0.25, 0, 0.19],
          targetRotationY: Math.PI / 2,
        },
        washroom: {
          anchorPosition: [1.95, 0, -2.65],
          approachPosition: [1.55, 0, -2.05],
          targetRotationY: Math.PI,
        },
      },
      walkBounds: { minX: -2.55, maxX: 2.55, minZ: -3.1, maxZ: 4.35 },
      obstacles: [
        { minX: -2.75, maxX: -0.9, minZ: 1.7, maxZ: 4.4 },
        { minX: -2.8, maxX: -0.48, minZ: -1.5, maxZ: 0.35 },
        { minX: 0.88, maxX: 2.22, minZ: -0.68, maxZ: 1.05 },
      ],
    },
    toastMessage: '🏠 Switched to Anime Studio 3D room!',
  },
  {
    id: 'cozy_villa',
    label: 'Cozy Villa',
    unlockLevel: 5,
    kind: 'glb',
    glbUrl: '/models/cozy-home-cutaway.glb',
    scale: 0.85,
    offset: [0.2, 0, 0],
    animateClockAndCanopy: true,
    interactionMap: {
      StudyFurniture: { type: 'zone', zone: 'study' },
      BedroomFurniture: { type: 'zone', zone: 'bedroom' },
      LivingFurniture: { type: 'zone', zone: 'dining' },
      KitchenFurniture: { type: 'zone', zone: 'kitchen' },
      BathroomFurniture: { type: 'zone', zone: 'washroom' },
      HouseStructure: { type: 'floor' },
    },
    roomLayout: {
      zoneOverrides: {
        study: {
          anchorPosition: [-2.19, 0, 1.35],
          approachPosition: [-1.35, 0, 1.35],
          targetRotationY: -Math.PI / 2,
        },
        bedroom: {
          anchorPosition: [-2.74, 0.48, -1.77],
          approachPosition: [-1.35, 0, -0.85],
          targetRotationY: 0,
        },
        dining: {
          anchorPosition: [0.55, 0, -0.45],
          approachPosition: [-0.25, 0, 0.35],
          targetRotationY: 0,
        },
        kitchen: {
          anchorPosition: [3.2, 0, -1.65],
          approachPosition: [2.45, 0, -0.85],
          targetRotationY: Math.PI,
        },
        washroom: {
          anchorPosition: [2.2, 0, 1.33],
          approachPosition: [1.35, 0, 0.95],
          targetRotationY: Math.PI / 2,
        },
      },
      walkBounds: { minX: -4.5, maxX: 4.5, minZ: -2.8, maxZ: 2.6 },
      obstacles: [
        { minX: -4.4, maxX: -2.0, minZ: -3.1, maxZ: -1.2 },
        { minX: 2.8, maxX: 4.95, minZ: -3.1, maxZ: -2.1 },
      ],
    },
    toastMessage: '🏡 Switched to Cozy Villa 3D room!',
  },
  {
    id: 'neon_gaming',
    label: 'Neon Gaming',
    unlockLevel: 7,
    kind: 'glb',
    glbUrl: '/models/neon-gaming-apartment.glb',
    scale: 0.9,
    offset: [0, 0, 0],
    interactionMap: {
      Bedroom_Gaming_Desk: { type: 'zone', zone: 'study' },
      Bedroom_Gaming_Chair: { type: 'zone', zone: 'study' },
      Bedroom_GameOn_NeonSign: { type: 'zone', zone: 'study' },
      Bedroom_King_Bed: { type: 'zone', zone: 'bedroom' },
      Bedroom_Wardrobe: { type: 'zone', zone: 'bedroom' },
      Neon_Room_Bedroom: { type: 'zone', zone: 'bedroom' },
      Bathroom_Glass_Shower: { type: 'zone', zone: 'washroom' },
      Bathroom_Toilet: { type: 'zone', zone: 'washroom' },
      Bathroom_Vanity: { type: 'zone', zone: 'washroom' },
      Neon_Room_Bathroom: { type: 'zone', zone: 'washroom' },
      Living_TV_Wall: { type: 'furniture', shortcut: 'smart_tv' },
      Kitchen_Dining_Area: { type: 'zone', zone: 'dining' },
      Living_Sectional_Sofa: { type: 'zone', zone: 'dining' },
      Living_Coffee_Table: { type: 'zone', zone: 'dining' },
      Neon_Room_Living: { type: 'zone', zone: 'dining' },
      Kitchen_Modular_Area: { type: 'zone', zone: 'kitchen' },
      Kitchen_Refrigerator: { type: 'zone', zone: 'kitchen' },
      Neon_Room_KitchenDining: { type: 'zone', zone: 'kitchen' },
      Neon_Architecture: { type: 'floor' },
    },
    roomLayout: {
      zoneOverrides: {
        study: {
          anchorPosition: [-4.05, 0, 0.85],
          approachPosition: [-3.15, 0, 0.85],
          targetRotationY: -Math.PI / 2,
        },
        bedroom: {
          anchorPosition: [-2.71, 0.48, -0.25],
          approachPosition: [-1.35, 0, 0.65],
          targetRotationY: 0,
        },
        washroom: {
          anchorPosition: [-2.0, 0, -2.65],
          approachPosition: [-1.25, 0, -2.0],
          targetRotationY: Math.PI,
        },
        kitchen: {
          anchorPosition: [2.65, 0, -2.45],
          approachPosition: [2.1, 0, -1.55],
          targetRotationY: Math.PI,
        },
        dining: {
          anchorPosition: [3.15, 0, 1.15],
          approachPosition: [2.15, 0, 0.85],
          targetRotationY: Math.PI / 2,
        },
      },
      walkBounds: { minX: -4.6, maxX: 4.75, minZ: -3.25, maxZ: 3.35 },
      obstacles: [{ minX: -0.55, maxX: -0.2, minZ: -3.4, maxZ: 0.5 }],
    },
    toastMessage: '🎮 Switched to Neon Gaming Apartment!',
  },
  {
    id: 'royal_palace',
    label: 'Royal Palace',
    unlockLevel: 10,
    kind: 'glb',
    glbUrl: '/models/royal-palace-suite.glb',
    scale: 0.65,
    offset: [0, 0, 0],
    interactionMap: {
      PlinthAndFloors: { type: 'floor' },
      PalaceFurnitureAndProps: { type: 'zone', zone: 'study' },
      CrystalChandelier: { type: 'furniture', shortcut: 'observatory' },
    },
    roomLayout: {
      zoneOverrides: {
        study: {
          anchorPosition: [-2.6, 0, 0.8],
          approachPosition: [-1.95, 0, 0.8],
          targetRotationY: -Math.PI / 2,
        },
        bedroom: {
          anchorPosition: [-2.6, 0.48, -1.5],
          approachPosition: [-1.85, 0, -0.6],
          targetRotationY: 0,
        },
        dining: {
          anchorPosition: [0, 0, 1.85],
          approachPosition: [0, 0, 1.5],
          targetRotationY: 0,
        },
        kitchen: {
          anchorPosition: [2.5, 0, -1.5],
          approachPosition: [1.95, 0, -0.8],
          targetRotationY: Math.PI,
        },
        washroom: {
          anchorPosition: [3.2, 0, 0.8],
          approachPosition: [2.4, 0, 0.8],
          targetRotationY: Math.PI / 2,
        },
      },
      walkBounds: { minX: -4.6, maxX: 4.6, minZ: -2.8, maxZ: 2.8 },
      obstacles: [{ minX: -1.45, maxX: 1.45, minZ: -1.2, maxZ: 1.2 }],
    },
    toastMessage: '👑 Switched to Royal Palace Suite!',
  },
];

export function isKnownHomeRoomStyle(value: unknown): value is HomeRoomStyle {
  return typeof value === 'string' && HOME_ROOM_CATALOG.some((item) => item.id === value);
}

export function getHomeRoomTheme(id: string | undefined): HomeRoomThemeConfig {
  return HOME_ROOM_CATALOG.find((item) => item.id === id) || HOME_ROOM_CATALOG[0];
}
