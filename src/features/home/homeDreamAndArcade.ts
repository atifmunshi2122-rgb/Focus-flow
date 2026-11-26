import type { AmbientPreset } from '../../lib/ambientAudio.ts';

export interface PaperAirplaneMessage {
  id: string;
  senderName: string;
  sourceLabel: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface DreamGlobeDestination {
  id: string;
  city: string;
  country: string;
  latDeg: number;
  lonDeg: number;
  goalLabel: string;
}

export const DREAM_GLOBE_CITIES: readonly DreamGlobeDestination[] = [
  { id: 'tokyo', city: 'Tokyo', country: 'Japan', latDeg: 35.68, lonDeg: 139.76, goalLabel: 'Tech & Study Trip' },
  { id: 'zurich', city: 'Zurich', country: 'Switzerland', latDeg: 47.37, lonDeg: 8.54, goalLabel: 'Masters / Research' },
  { id: 'singapore', city: 'Singapore', country: 'Singapore', latDeg: 1.35, lonDeg: 103.82, goalLabel: 'Career Launchpad' },
  { id: 'london', city: 'London', country: 'UK', latDeg: 51.5, lonDeg: -0.12, goalLabel: 'Global Fellowship' },
  { id: 'nyc', city: 'New York', country: 'USA', latDeg: 40.71, lonDeg: -74.0, goalLabel: 'Dream Milestone' },
];

export interface VinylRecordSleeve {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  accentColor: string;
  requiredSessions: number;
  ambientPreset: AmbientPreset;
  useBinaural?: boolean;
  unlocked: boolean;
}

export function computeVinylRecordRack(totalCompletedSessions: number): VinylRecordSleeve[] {
  const count = Math.max(0, Math.floor(totalCompletedSessions || 0));
  const catalog: Array<Omit<VinylRecordSleeve, 'unlocked'>> = [
    {
      id: 'vinyl_rain',
      title: 'Monsoon Rain',
      subtitle: 'Cozy Study Ambience',
      color: '#0284c7',
      accentColor: '#7dd3fc',
      requiredSessions: 0,
      ambientPreset: 'rain',
    },
    {
      id: 'vinyl_cafe',
      title: 'Midnight Cafe',
      subtitle: 'Warm Espresso Lo-Fi',
      color: '#b45309',
      accentColor: '#fde68a',
      requiredSessions: 2,
      ambientPreset: 'cafe',
    },
    {
      id: 'vinyl_alpha',
      title: 'Alpha Flow LP',
      subtitle: '10Hz Binaural Focus',
      color: '#6d28d9',
      accentColor: '#c4b5fd',
      requiredSessions: 5,
      ambientPreset: 'drone',
      useBinaural: true,
    },
    {
      id: 'vinyl_ocean',
      title: 'Horizon Waves',
      subtitle: 'Deep Calm Recovery',
      color: '#0f766e',
      accentColor: '#5eead4',
      requiredSessions: 8,
      ambientPreset: 'ocean',
    },
  ];
  return catalog.map((item) => ({
    ...item,
    unlocked: count >= item.requiredSessions,
  }));
}

export type WeatherOrbMood = 'calm_clouds' | 'golden_sun' | 'electric_storm';

export interface MomentumWeatherOrbState {
  mood: WeatherOrbMood;
  label: string;
  primaryColor: string;
  coreIntensity: number;
}

export function computeMomentumWeatherOrbState(params: {
  todayFocusMinutes: number;
  isFlowStateActive: boolean;
  isRunning: boolean;
}): MomentumWeatherOrbState {
  if (params.isFlowStateActive || params.todayFocusMinutes >= 60) {
    return {
      mood: 'electric_storm',
      label: 'Electric Focus Storm (60m+ / Flow)',
      primaryColor: '#38bdf8',
      coreIntensity: 1.9,
    };
  }
  if (params.isRunning || params.todayFocusMinutes > 0) {
    return {
      mood: 'golden_sun',
      label: `Golden Momentum (${params.todayFocusMinutes}m today)`,
      primaryColor: '#fbbf24',
      coreIntensity: 1.45,
    };
  }
  return {
    mood: 'calm_clouds',
    label: 'Calm Mist · Start focus to ignite orb',
    primaryColor: '#cbd5e1',
    coreIntensity: 0.65,
  };
}

export function computeDreamGlobeProgress(bestSavingsPct: number): number {
  return Math.max(0.05, Math.min(1, (Number(bestSavingsPct) || 0) / 100));
}

