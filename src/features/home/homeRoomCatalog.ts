import type { HomeZoneId } from './homeRoutineEngine.ts';
import type { FurnitureShortcutId } from './homeFeaturesEngine.ts';

export type HomeRoomStyle = 'classic' | 'anime_studio' | 'cozy_villa' | 'neon_gaming';

export type GlbInteractionTarget =
  | { type: 'zone'; zone: HomeZoneId }
  | { type: 'furniture'; shortcut: FurnitureShortcutId }
  | { type: 'floor' };

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
    toastMessage: '🎮 Switched to Neon Gaming Apartment!',
  },
];

export function isKnownHomeRoomStyle(value: unknown): value is HomeRoomStyle {
  return typeof value === 'string' && HOME_ROOM_CATALOG.some((item) => item.id === value);
}

export function getHomeRoomTheme(id: string | undefined): HomeRoomThemeConfig {
  return HOME_ROOM_CATALOG.find((item) => item.id === id) || HOME_ROOM_CATALOG[0];
}

