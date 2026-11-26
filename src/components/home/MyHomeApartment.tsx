import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { HomeZoneId } from '../../features/home/homeRoutineEngine.ts';
import type { RoomLighting } from '../../features/study-room/customization-types.ts';
import type {
  ApartmentExpansionState,
  CalendarSeasonState,
  CorkboardTaskNote,
  DoomscrollJarState,
  DoorstepDeliveriesState,
  ExamCountdownSummary,
  FurnitureShortcutId,
  HomeDecorUnlocks,
  HydrationHabitState,
  LivingBookshelfSlot,
  LivingPlantStage,
  TimeCapsuleChestState,
  VaultSafeState,
} from '../../features/home/homeFeaturesEngine.ts';
import {
  MyHomeUnlockedDecor,
  MyHomeWindowRain,
  StudyDeskClutter,
} from './MyHomeDecorAndClutter.tsx';
import {
  CorkboardRealStickyNotes,
  LiveExamCountdownFrame,
  LiveLaptopDisplay,
  OutForClassDoorPlacard,
  SeasonalAndSpecialProps,
} from './MyHomeLivingSurfaces.tsx';
import {
  ApartmentExpansionStructure,
  DoomscrollTaxJarProp,
  DoorstepParcelAndMailProp,
  FlowStateGoldenAuraProp,
  HydrationBottleProp,
  TimeCapsuleChestProp,
  VaultSafeProp,
  VinylTurntableProp,
  WallMiniWhiteboardProp,
} from './MyHomeProgressionProps.tsx';
import {
  createBluePlaidTexture,
  createDiamondRugTexture,
  createMtFujiArtTexture,
  createOakFloorTexture,
  createTileGridTexture,
  createWindowBackdropTexture,
  createWovenRugTexture,
} from './MyHomeTextures.ts';

const DEFAULT_UNLOCKS: HomeDecorUnlocks = {
  mechKeyboard: false,
  dualMonitor: false,
  extraPlants: false,
  fairyLights: false,
  espressoUpgrade: false,
  gamingChair: false,
};

interface MyHomeApartmentProps {
  activeZone: HomeZoneId;
  lightingMode: RoomLighting;
  isSleeping: boolean;
  isStudying: boolean;
  isBrewingCoffee: boolean;
  clutterLevel?: 0 | 1 | 2 | 3;
  lampDimFactor?: number;
  unlocks?: HomeDecorUnlocks;
  isRaining?: boolean;
  isVisiting?: boolean;
  corkboardTasks?: CorkboardTaskNote[];
  examSummary?: ExamCountdownSummary;
  seasonState?: CalendarSeasonState;
  laptopScreen?: {
    timerLabel: string;
    modeLabel: string;
    isRunning: boolean;
    progressRatio: number;
    subtitle: string;
  };
  outOfRoom?: { visible: boolean; label: string };
  plantStage?: LivingPlantStage;
  vaultSafe?: VaultSafeState;
  deliveries?: DoorstepDeliveriesState;
  whiteboardPreview?: { dataUrl: string | null; title?: string };
  isFlowStateActive?: boolean;
  hasFourCycleLantern?: boolean;
  doomscrollJar?: DoomscrollJarState;
  bookshelfBooks?: LivingBookshelfSlot[];
  timeCapsuleChest?: TimeCapsuleChestState;
  isVinylPlaying?: boolean;
  hydrationState?: HydrationHabitState;
  apartmentExpansion?: ApartmentExpansionState;
  onSelectZone: (zone: HomeZoneId) => void;
  onClickFurniture?: (shortcut: FurnitureShortcutId) => void;
  onCompleteCorkboardTask?: (taskId: string) => void;
}

const OAK_WOOD = '#b76c35';
const OAK_DARK = '#8e4d20';
const WALL_IVORY = '#ece6e0';
const PLINTH_NAVY = '#192341';
const CUT_CAP_NAVY = '#253259';
const METAL_DARK = '#1f2937';
const CHROME = '#cbd5e1';

function setPointerCursor(hovering: boolean) {
  if (typeof document !== 'undefined') {
    document.body.style.cursor = hovering ? 'pointer' : 'auto';
  }
}

const PlantStageContext = createContext<LivingPlantStage>('leafy');

/** Leafy potted plant used across desk, shelves, kitchen cabinets & dining centerpiece */
const PottedPlant: React.FC<{
  position: [number, number, number];
  scale?: number;
  potColor?: string;
  trailing?: boolean;
}> = ({ position, scale = 1, potColor = '#e2dcd5', trailing = false }) => {
  const stage = useContext(PlantStageContext);
  const foliageScale = stage === 'sprout' ? 0.72 : stage === 'blooming' ? 1.12 : stage === 'wilted' ? 0.88 : 1.0;
  const leafDark = stage === 'wilted' ? '#857c3a' : stage === 'sprout' ? '#4ade80' : '#3f8f45';
  const leafLight = stage === 'wilted' ? '#9c9248' : stage === 'sprout' ? '#86efac' : '#4fa856';
  const droopAngle = stage === 'wilted' ? 1.45 : 1;
  const leafYShift = stage === 'wilted' ? -0.05 : 0;

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.1, 0.28, 16]} />
        <meshStandardMaterial color={potColor} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.03, 14]} />
        <meshStandardMaterial color="#3b2618" roughness={0.95} />
      </mesh>
      <group scale={[foliageScale, foliageScale, foliageScale]} position={[0, leafYShift, 0]}>
        {[
          [0, 0.4, 0, 0, 0.28],
          [-0.1, 0.38, 0.07, 0.45 * droopAngle, 0.24],
          [0.11, 0.37, -0.06, -0.45 * droopAngle, 0.24],
          [-0.07, 0.36, -0.09, -0.35 * droopAngle, 0.22],
          [0.08, 0.39, 0.09, 0.35 * droopAngle, 0.23],
          [0, 0.46, -0.02, 0.15 * droopAngle, 0.21],
        ].map(([lx, ly, lz, rot, s], idx) => (
          <mesh
            key={idx}
            position={[lx, ly, lz]}
            rotation={[rot, idx * 1.1, rot * 0.7]}
            scale={[s, s * 1.35, s * 0.45]}
            castShadow
          >
            <sphereGeometry args={[0.45, 10, 10]} />
            <meshStandardMaterial color={idx % 2 === 0 ? leafDark : leafLight} roughness={0.58} />
          </mesh>
        ))}

        {/* 30-Day+ Streak Blooming Flowers */}
        {stage === 'blooming' &&
          [
            [-0.08, 0.49, 0.06, '#fb7185'],
            [0.09, 0.47, -0.05, '#fbbf24'],
            [0.01, 0.54, 0.01, '#f472b6'],
          ].map(([fx, fy, fz, fc], idx) => (
            <mesh key={`fl-${idx}`} position={[fx as number, fy as number, fz as number]}>
              <sphereGeometry args={[0.042, 8, 8]} />
              <meshStandardMaterial color={fc as string} emissive={fc as string} emissiveIntensity={0.4} />
            </mesh>
          ))}
      </group>
      {trailing && (
        <group position={[0.11, 0.18, 0.06]}>
          {[0, -0.1, -0.2, -0.3].map((vy, idx) => (
            <mesh key={idx} position={[idx * 0.03, vy, idx * 0.02]} rotation={[0.3, idx * 0.5, 0.4]}>
              <sphereGeometry args={[0.048, 8, 8]} />
              <meshStandardMaterial color={leafLight} roughness={0.6} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
};

/** Decorative row of vertical colorful books */
const BookRow: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  count?: number;
  heightScale?: number;
}> = ({ position, rotationY = 0, count = 7, heightScale = 1 }) => {
  const colors = ['#dc2626', '#2563eb', '#d97706', '#059669', '#7c3aed', '#0f766e', '#e11d48', '#4338ca'];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const h = (0.18 + ((i * 7) % 4) * 0.025) * heightScale;
        return (
          <mesh key={i} position={[i * 0.044, h / 2, 0]} castShadow>
            <boxGeometry args={[0.038, h, 0.14]} />
            <meshStandardMaterial color={colors[i % colors.length]} roughness={0.65} />
          </mesh>
        );
      })}
    </group>
  );
};

const DEFAULT_EXAM_SUMMARY: ExamCountdownSummary = {
  hasExam: false,
  examTitle: 'Set Target Exam',
  examDate: null,
  daysLeft: null,
  isExamWeek: false,
  todayFocusMinutes: 0,
  dailyGoalMinutes: 120,
  dailyTargetPct: 0,
};

const DEFAULT_SEASON_STATE: CalendarSeasonState = {
  season: 'spring_clear',
  seasonLabel: 'Clear Season',
  showRainWindow: false,
  showSnowWindow: false,
  showHotTeaMug: false,
  forceFairyLights: false,
  showExamWeekBooks: false,
  isBirthdayToday: false,
  birthDateConfigured: false,
};

const DEFAULT_VAULT_SAFE: VaultSafeState = {
  tier: 'starter',
  bestSavingsPct: 0,
  label: 'Starter Steel Safe (<25%)',
};

const DEFAULT_DELIVERIES: DoorstepDeliveriesState = {
  hasParcel: false,
  hasMail: false,
  parcelCount: 0,
  mailCount: 0,
  recentShoppingParcels: [],
  upcomingBills: [],
};

const DEFAULT_DOOMSCROLL_JAR: DoomscrollJarState = {
  totalTaxAmount: 0,
  totalMinutes: 0,
  entryCount: 0,
  coinCount: 0,
  isEmpty: true,
};

const DEFAULT_CAPSULE_CHEST: TimeCapsuleChestState = {
  totalCount: 0,
  readyCount: 0,
  lockedCount: 0,
  openedCount: 0,
  shouldGlow: false,
  readyCapsules: [],
  lockedCapsules: [],
};

const DEFAULT_HYDRATION: HydrationHabitState = {
  hasHydrationHabit: false,
  hydratedToday: false,
  waterFillRatio: 0.72,
};

const DEFAULT_EXPANSION: ApartmentExpansionState = {
  tier: 'studio',
  hasBalcony: false,
  hasPenthouse: false,
  effectiveLevel: 1,
  tierLabel: 'Cozy Studio',
};

export const MyHomeApartment: React.FC<MyHomeApartmentProps> = ({
  activeZone,
  lightingMode,
  isSleeping,
  isStudying,
  isBrewingCoffee,
  clutterLevel = 0,
  lampDimFactor = 1,
  unlocks = DEFAULT_UNLOCKS,
  isRaining = false,
  isVisiting = false,
  corkboardTasks = [],
  examSummary = DEFAULT_EXAM_SUMMARY,
  seasonState = DEFAULT_SEASON_STATE,
  laptopScreen = {
    timerLabel: '25:00',
    modeLabel: 'READY',
    isRunning: false,
    progressRatio: 0,
    subtitle: 'Study Desk',
  },
  outOfRoom = { visible: false, label: '' },
  plantStage = 'leafy',
  vaultSafe = DEFAULT_VAULT_SAFE,
  deliveries = DEFAULT_DELIVERIES,
  whiteboardPreview = { dataUrl: null },
  isFlowStateActive = false,
  hasFourCycleLantern = false,
  doomscrollJar = DEFAULT_DOOMSCROLL_JAR,
  bookshelfBooks,
  timeCapsuleChest = DEFAULT_CAPSULE_CHEST,
  isVinylPlaying = false,
  hydrationState = DEFAULT_HYDRATION,
  apartmentExpansion = DEFAULT_EXPANSION,
  onSelectZone,
  onClickFurniture,
  onCompleteCorkboardTask,
}) => {
  const [hoveredZone, setHoveredZone] = useState<HomeZoneId | null>(null);
  const [hoveredFurniture, setHoveredFurniture] = useState<{
    id: FurnitureShortcutId;
    label: string;
    pos: [number, number, number];
  } | null>(null);
  const clockHourRef = useRef<THREE.Group>(null);
  const clockMinRef = useRef<THREE.Group>(null);
  const clockSecRef = useRef<THREE.Group>(null);
  const steamGroupRef = useRef<THREE.Group>(null);

  const textures = useMemo(() => {
    const windowMode: 'night' | 'sunset' | 'day' =
      lightingMode === 'night' ? 'night' : lightingMode === 'sunset' ? 'sunset' : 'day';
    return {
      oakFloor: createOakFloorTexture(),
      plaid: createBluePlaidTexture(),
      wovenRug: createWovenRugTexture(),
      diamondRug: createDiamondRugTexture(),
      bathTile: createTileGridTexture('#d2d7e0', '#8d96a8', 4, 4),
      bathWallTile: createTileGridTexture('#dcd6d4', '#a59fa3', 4, 3),
      mtFuji: createMtFujiArtTexture(),
      windowVista: createWindowBackdropTexture(windowMode),
    };
  }, [lightingMode]);

  useEffect(() => {
    return () => {
      Object.values(textures).forEach((tex) => tex.dispose());
    };
  }, [textures]);

  // Animate analog wall clock hands & gentle kitchen coffee steam wisps
  useFrame(({ clock }) => {
    const now = new Date();
    const secs = now.getSeconds() + now.getMilliseconds() / 1000;
    const mins = now.getMinutes() + secs / 60;
    const hrs = (now.getHours() % 12) + mins / 60;

    if (clockHourRef.current) clockHourRef.current.rotation.z = -(hrs / 12) * Math.PI * 2;
    if (clockMinRef.current) clockMinRef.current.rotation.z = -(mins / 60) * Math.PI * 2;
    if (clockSecRef.current) clockSecRef.current.rotation.z = -(secs / 60) * Math.PI * 2;

    if (steamGroupRef.current && isBrewingCoffee) {
      const t = clock.getElapsedTime();
      steamGroupRef.current.children.forEach((child, i) => {
        const phase = (t * 0.7 + i * 0.35) % 1;
        child.position.y = phase * 0.32;
        child.position.x = Math.sin(t * 2 + i) * 0.025;
        child.scale.setScalar(0.7 + phase * 0.6);
      });
    }
  });

  const makeZoneHandlers = (zone: HomeZoneId) => ({
    onClick: (e: any) => {
      e.stopPropagation();
      onSelectZone(zone);
    },
    onPointerOver: (e: any) => {
      e.stopPropagation();
      setHoveredZone(zone);
      setPointerCursor(true);
    },
    onPointerOut: () => {
      setHoveredZone((curr) => (curr === zone ? null : curr));
      setPointerCursor(false);
    },
  });

  const makeFurnitureHandlers = (
    id: FurnitureShortcutId,
    label: string,
    pos: [number, number, number]
  ) => ({
    onClick: (e: any) => {
      e.stopPropagation();
      onClickFurniture?.(id);
    },
    onPointerOver: (e: any) => {
      e.stopPropagation();
      setHoveredFurniture({ id, label, pos });
      setPointerCursor(true);
    },
    onPointerOut: (e: any) => {
      e.stopPropagation();
      setHoveredFurniture((curr) => (curr?.id === id ? null : curr));
      setPointerCursor(false);
    },
  });

  const baseDeskLampPower = isSleeping ? 0.45 : isStudying || lightingMode === 'night' || lightingMode === 'sunset' ? 2.1 : 1.1;
  const deskLampPower = baseDeskLampPower * lampDimFactor;
  const underCabinetPower = isSleeping ? 0.4 : 1.8;
  const bedsideLampPower = isSleeping ? 1.7 : lightingMode === 'night' ? 1.85 : 1.05;
  const lanternPower = hasFourCycleLantern ? 3.2 : isSleeping ? 1.25 : 1.65;
  const showerLightPower = isSleeping ? 0.35 : activeZone === 'washroom' ? 2.2 : 1.35;

  return (
    <PlantStageContext.Provider value={plantStage}>
    <group>
      {/* ===================== 1. BEVELED DIORAMA PLINTH & HONEY-OAK FLOOR ===================== */}
      <mesh position={[0.1, -0.22, -0.05]} receiveShadow>
        <boxGeometry args={[10.85, 0.38, 7.15]} />
        <meshStandardMaterial color={PLINTH_NAVY} roughness={0.78} metalness={0.08} />
      </mesh>
      {/* Lower cutaway trim lip */}
      <mesh position={[0.1, -0.39, -0.05]}>
        <boxGeometry args={[11.1, 0.08, 7.4]} />
        <meshStandardMaterial color="#101830" roughness={0.85} />
      </mesh>

      {/* Main Honey-Oak Wooden Flooring (x=-5.0..+2.85, z=-3.45..+3.35) */}
      <mesh position={[-1.08, 0, -0.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[7.88, 6.84]} />
        <meshStandardMaterial map={textures.oakFloor} roughness={0.34} metalness={0.06} />
      </mesh>

      {/* Subtle Front Architectural Curb Frame matching the isometric box aesthetic */}
      <mesh position={[-1.0, 0.08, 3.4]} receiveShadow>
        <boxGeometry args={[8.15, 0.16, 0.18]} />
        <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.62} />
      </mesh>
      <mesh position={[4.05, 0.11, 2.92]} receiveShadow>
        <boxGeometry args={[2.55, 0.22, 0.18]} />
        <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.62} />
      </mesh>

      {/* ===================== 2. CUTAWAY WALLS & WINDOW WITH CURTAINS ===================== */}
      {/* Continuous Back Wall (Bedroom + Kitchen + Washroom back) */}
      <mesh position={[0.15, 1.65, -3.52]} receiveShadow castShadow>
        <boxGeometry args={[10.55, 3.3, 0.18]} />
        <meshStandardMaterial color={WALL_IVORY} roughness={0.86} />
      </mesh>
      {/* Back Wall Dark Cutaway Cap */}
      <mesh position={[0.15, 3.32, -3.52]}>
        <boxGeometry args={[10.6, 0.06, 0.22]} />
        <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.55} />
      </mesh>

      {/* Left Wall Built Around Real Window Opening (x = -5.06, z = -3.5..+3.45) */}
      {/* Below window sill */}
      <mesh position={[-5.06, 0.54, -0.02]} receiveShadow castShadow>
        <boxGeometry args={[0.18, 1.08, 7.02]} />
        <meshStandardMaterial color={WALL_IVORY} roughness={0.86} />
      </mesh>
      {/* Back section behind window */}
      <mesh position={[-5.06, 2.18, -2.58]} receiveShadow castShadow>
        <boxGeometry args={[0.18, 2.22, 1.9]} />
        <meshStandardMaterial color={WALL_IVORY} roughness={0.86} />
      </mesh>
      {/* Front stepped section ahead of window (matches image step-down profile) */}
      <mesh position={[-5.06, 1.92, 2.22]} receiveShadow castShadow>
        <boxGeometry args={[0.18, 1.7, 2.55]} />
        <meshStandardMaterial color={WALL_IVORY} roughness={0.86} />
      </mesh>
      {/* Above window lintel */}
      <mesh position={[-5.06, 3.06, -0.35]} receiveShadow castShadow>
        <boxGeometry args={[0.18, 0.48, 2.66]} />
        <meshStandardMaterial color={WALL_IVORY} roughness={0.86} />
      </mesh>
      {/* Left Wall Cap Highlights */}
      <mesh position={[-5.06, 3.32, -1.7]}>
        <boxGeometry args={[0.22, 0.06, 3.65]} />
        <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.55} />
      </mesh>
      <mesh position={[-5.06, 2.79, 1.95]}>
        <boxGeometry args={[0.22, 0.06, 3.05]} />
        <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.55} />
      </mesh>

      {/* Left Wall Window Backdrop (Night Moon & House Silhouettes / Day / Sunset) */}
      <group
        position={[-5.12, 1.95, -0.35]}
        {...makeFurnitureHandlers('window_speaker', 'Window · Toggle Ambient Audio', [-4.75, 2.55, -0.35])}
      >
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[2.58, 1.8]} />
          <meshBasicMaterial map={textures.windowVista} />
        </mesh>
        {/* Window Outer Frame & Center Mullions */}
        {[
          [0.05, 0.88, 0, 0.06, 0.06, 2.62],
          [0.05, -0.88, 0, 0.06, 0.06, 2.62],
          [0.05, 0, -1.28, 0.06, 1.8, 0.06],
          [0.05, 0, 1.28, 0.06, 1.8, 0.06],
          [0.05, 0, 0, 0.04, 1.76, 0.045],
          [0.05, 0.08, 0, 0.04, 0.04, 2.54],
        ].map(([px, py, pz, sx, sy, sz], i) => (
          <mesh key={i} position={[px, py, pz]}>
            <boxGeometry args={[sx, sy, sz]} />
            <meshStandardMaterial color="#1e2436" roughness={0.45} metalness={0.35} />
          </mesh>
        ))}
        {/* Curtain Rod & Finials */}
        <mesh position={[0.14, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 3.1, 10]} />
          <meshStandardMaterial color="#3b2c22" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Pleated Beige Curtains Left & Right */}
        {[-1.25, -1.08, 1.08, 1.25].map((cz, idx) => (
          <mesh key={idx} position={[0.14, 0.02, cz]} castShadow>
            <cylinderGeometry args={[0.095, 0.125, 2.02, 12]} />
            <meshStandardMaterial color="#d2c7bc" roughness={0.85} />
          </mesh>
        ))}
      </group>

      {/* ===================== 3. ZONE 1: STUDY CORNER (LEFT WALL) ===================== */}
      <group {...makeZoneHandlers('study')}>
        {/* Subtle Interactive Floor/Desk Highlight Ring on Hover or Active */}
        {(hoveredZone === 'study' || activeZone === 'study') && (
          <mesh position={[-3.7, 0.015, 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.85, 0.98, 32]} />
            <meshBasicMaterial
              color={hoveredZone === 'study' ? '#fbbf24' : '#818cf8'}
              transparent
              opacity={0.45}
            />
          </mesh>
        )}

        {/* Wooden Study Desk with Left & Right Drawer Pedestals */}
        <group position={[-4.42, 0, 1.05]}>
          {/* Tabletop */}
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.98, 0.06, 2.52]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.48} />
          </mesh>
          {/* Back modesty panel */}
          <mesh position={[-0.42, 0.42, 0]} castShadow>
            <boxGeometry args={[0.05, 0.62, 2.4]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.6} />
          </mesh>
          {/* Front & Back Drawer Pedestals */}
          {[-0.92, 0.92].map((pz, idx) => (
            <group key={idx} position={[0, 0.36, pz]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[0.88, 0.72, 0.54]} />
                <meshStandardMaterial color={OAK_DARK} roughness={0.55} />
              </mesh>
              {[0.2, 0, -0.2].map((dy, dIdx) => (
                <group key={dIdx}>
                  <mesh position={[0.45, dy, 0]}>
                    <boxGeometry args={[0.02, 0.16, 0.48]} />
                    <meshStandardMaterial color={OAK_WOOD} roughness={0.48} />
                  </mesh>
                  <mesh position={[0.47, dy, 0]}>
                    <boxGeometry args={[0.015, 0.02, 0.1]} />
                    <meshStandardMaterial color={CHROME} metalness={0.7} roughness={0.25} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}

          {/* Glowing Open Laptop on Desk */}
          <group
            position={[0.08, 0.78, 0.02]}
            {...makeFurnitureHandlers('laptop', 'Laptop · Start / Pause Focus Timer', [-4.25, 1.32, 1.07])}
          >
            <mesh position={[0, 0.012, 0]} castShadow>
              <boxGeometry args={[0.32, 0.022, 0.42]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.4} />
            </mesh>
            <group position={[-0.14, 0.16, 0]} rotation={[0, 0, 0.22]}>
              <mesh castShadow>
                <boxGeometry args={[0.018, 0.28, 0.42]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.5} />
              </mesh>
              <LiveLaptopDisplay
                timerLabel={laptopScreen.timerLabel}
                modeLabel={laptopScreen.modeLabel}
                isRunning={laptopScreen.isRunning}
                isSleeping={isSleeping}
                progressRatio={laptopScreen.progressRatio}
                subtitle={laptopScreen.subtitle}
              />
            </group>
          </group>

          {/* Desk Lamp with Warm Amber Light */}
          <group position={[-0.22, 0.78, 0.85]}>
            <mesh position={[0, 0.02, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.12, 0.04, 16]} />
              <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[-0.04, 0.24, 0]} rotation={[0, 0, -0.22]}>
              <cylinderGeometry args={[0.014, 0.014, 0.44, 8]} />
              <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0.06, 0.43, 0]} rotation={[0, 0, -0.5]}>
              <coneGeometry args={[0.12, 0.16, 16]} />
              <meshStandardMaterial color="#292524" roughness={0.4} emissive="#ffbe69" emissiveIntensity={0.2} />
            </mesh>
            <pointLight
              position={[0.14, 0.36, 0]}
              color="#ffb454"
              intensity={deskLampPower}
              distance={4.8}
              decay={1.8}
            />
          </group>

          {/* Open Notebook + Pen Cup + Stacked Hardcover Books */}
          <mesh position={[0.14, 0.79, 0.46]} castShadow>
            <boxGeometry args={[0.2, 0.018, 0.26]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.85} />
          </mesh>
          <mesh position={[-0.18, 0.84, 0.42]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.12, 12]} />
            <meshStandardMaterial color="#d97706" roughness={0.5} />
          </mesh>
          {/* Stacked Books on Right Back Side of Desk */}
          <group position={[0.08, 0.78, -0.82]}>
            {[
              { y: 0.025, c: '#7f1d1d', w: 0.26, d: 0.2 },
              { y: 0.068, c: '#1e3a8a', w: 0.24, d: 0.19 },
              { y: 0.11, c: '#0f766e', w: 0.22, d: 0.18 },
            ].map((bk, idx) => (
              <mesh key={idx} position={[0, bk.y, 0]} rotation={[0, idx * 0.12, 0]} castShadow>
                <boxGeometry args={[bk.w, 0.04, bk.d]} />
                <meshStandardMaterial color={bk.c} roughness={0.65} />
              </mesh>
            ))}
          </group>
          {/* Trash Bin under right corner */}
          <mesh position={[0.2, 0.18, -1.42]} castShadow>
            <cylinderGeometry args={[0.14, 0.11, 0.36, 14]} />
            <meshStandardMaterial color="#334155" roughness={0.65} />
          </mesh>
        </group>

        {/* Left Wall Corkboard + Headphones + 2 Floating Wooden Shelves */}
        <group position={[-4.92, 0, 1.75]}>
          {/* Corkboard */}
          <mesh
            position={[0, 1.38, 0]}
            castShadow
            {...makeFurnitureHandlers('wall_schedule', 'Corkboard · Tasks & Bills Due', [-4.72, 1.85, 1.75])}
          >
            <boxGeometry args={[0.04, 0.62, 0.88]} />
            <meshStandardMaterial color="#c0844c" roughness={0.85} />
          </mesh>
          <CorkboardRealStickyNotes
            notes={corkboardTasks}
            isVisiting={isVisiting}
            onCompleteTask={onCompleteCorkboardTask}
            onOpenSchedulePopup={() => onClickFurniture?.('wall_schedule')}
          />

          {/* Mounted Headphones beside Corkboard */}
          <group
            position={[0.05, 1.48, -0.62]}
            rotation={[0, Math.PI / 2, 0]}
            {...makeFurnitureHandlers('window_speaker', 'Headphones · Cycle Ambient Audio', [-4.72, 1.82, 1.13])}
          >
            <mesh>
              <torusGeometry args={[0.1, 0.018, 10, 20, Math.PI]} />
              <meshStandardMaterial color={METAL_DARK} roughness={0.4} metalness={0.4} />
            </mesh>
            {[-0.1, 0.1].map((hx, i) => (
              <mesh key={i} position={[hx, -0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.045, 0.045, 0.035, 14]} />
                <meshStandardMaterial color="#111827" roughness={0.35} />
              </mesh>
            ))}
          </group>

          {/* Floating Shelf Lower (y = 1.88) & Books */}
          <mesh position={[0.16, 1.88, -0.02]} castShadow receiveShadow>
            <boxGeometry args={[0.28, 0.04, 1.08]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
          </mesh>
          <BookRow position={[0.16, 1.9, -0.35]} rotationY={Math.PI / 2} count={9} heightScale={0.95} />

          {/* Floating Shelf Upper (y = 2.38) + Figurine + Trailing Vine Plant */}
          <mesh position={[0.16, 2.38, -0.02]} castShadow receiveShadow>
            <boxGeometry args={[0.28, 0.04, 1.08]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
          </mesh>
          {/* Cute Chibi Desk Figurine on Upper Shelf */}
          <group position={[0.16, 2.4, 0.25]}>
            <mesh position={[0, 0.07, 0]}>
              <cylinderGeometry args={[0.04, 0.055, 0.14, 10]} />
              <meshStandardMaterial color="#6366f1" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.18, 0]}>
              <sphereGeometry args={[0.055, 12, 12]} />
              <meshStandardMaterial color="#fce0c8" roughness={0.6} />
            </mesh>
          </group>
          <PottedPlant position={[0.16, 2.4, -0.32]} scale={0.55} trailing />
        </group>

        {/* Ergonomic Black Swivel Desk Chair (x=-3.32, z=1.05 facing -X) */}
        <group position={[-3.32, 0, 1.05]} rotation={[0, -Math.PI / 2, 0]}>
          {/* 5-star base & caster pillar */}
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.4, 10]} />
            <meshStandardMaterial color={METAL_DARK} metalness={0.5} roughness={0.35} />
          </mesh>
          {[0, 1, 2, 3, 4].map((idx) => {
            const ang = (idx / 5) * Math.PI * 2;
            return (
              <mesh
                key={idx}
                position={[Math.sin(ang) * 0.14, 0.04, Math.cos(ang) * 0.14]}
                rotation={[0, ang, 0]}
              >
                <boxGeometry args={[0.035, 0.03, 0.28]} />
                <meshStandardMaterial color="#111827" roughness={0.5} />
              </mesh>
            );
          })}
          {/* Cushioned Seat */}
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.07, 0.5]} />
            <meshStandardMaterial color="#1e2432" roughness={0.65} />
          </mesh>
          {/* Ergonomic Backrest */}
          <mesh position={[0, 0.78, -0.23]} rotation={[0.08, 0, 0]} castShadow>
            <boxGeometry args={[0.46, 0.58, 0.06]} />
            <meshStandardMaterial color="#272e3f" roughness={0.6} />
          </mesh>
          {/* Armrests */}
          {[-0.27, 0.27].map((ax, i) => (
            <mesh key={i} position={[ax, 0.58, -0.04]} castShadow>
              <boxGeometry args={[0.05, 0.03, 0.34]} />
              <meshStandardMaterial color="#111827" roughness={0.55} />
            </mesh>
          ))}
        </group>

        {/* Large Floor Leafy Plant front-left of desk + Medium Plant back of desk */}
        <PottedPlant position={[-4.4, 0, 2.75]} scale={1.45} potColor="#e5e0d8" />
        <PottedPlant position={[-4.25, 0, -0.58]} scale={0.92} potColor="#dad3ca" />
      </group>

      {/* ===================== 4. ZONE 2: BEDROOM (CENTER-BACK) ===================== */}
      <group {...makeZoneHandlers('bedroom')}>
        {(hoveredZone === 'bedroom' || activeZone === 'bedroom') && (
          <mesh position={[-2.12, 0.02, -2.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.15, 1.28, 36]} />
            <meshBasicMaterial
              color={hoveredZone === 'bedroom' ? '#fbbf24' : '#818cf8'}
              transparent
              opacity={0.42}
            />
          </mesh>
        )}

        {/* Grey-Blue Woven Bedroom Rug */}
        <mesh position={[-2.1, 0.008, -1.75]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2.55, 2.5]} />
          <meshStandardMaterial map={textures.wovenRug} roughness={0.92} />
        </mesh>

        {/* Single Wooden Bed + Blue Plaid Bedding + Royal-Blue Throw Blanket */}
        <group
          position={[-2.12, 0, -2.25]}
          {...makeFurnitureHandlers('bed', 'Bed · End Day Sleep Ritual & Summary', [-2.12, 1.15, -2.0])}
        >
          {/* Wooden Frame */}
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.44, 0.24, 2.12]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
          </mesh>
          {/* Bed Headboard */}
          <mesh position={[0, 0.58, -1.03]} castShadow receiveShadow>
            <boxGeometry args={[1.48, 0.92, 0.08]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.5} />
          </mesh>
          {/* Mattress & Blue Plaid Sheet */}
          <mesh position={[0, 0.39, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[1.36, 0.18, 1.98]} />
            <meshStandardMaterial map={textures.plaid} roughness={0.85} />
          </mesh>
          {/* Blue Plaid Pillow */}
          <mesh position={[0, 0.54, -0.74]} rotation={[0.14, 0, 0]} castShadow>
            <boxGeometry args={[0.88, 0.14, 0.42]} />
            <meshStandardMaterial map={textures.plaid} roughness={0.85} />
          </mesh>
          {/* Royal-Blue Folded Throw Blanket on Lower Half */}
          <mesh position={[0, 0.44, 0.42]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 0.12, 1.15]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.8} />
          </mesh>
        </group>

        {/* Wooden Nightstand + Softly Glowing Bedside Lamp */}
        <group position={[-1.06, 0, -3.05]}>
          <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.56, 0.48]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.52} />
          </mesh>
          <mesh position={[0, 0.36, 0.25]}>
            <boxGeometry args={[0.42, 0.18, 0.02]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.55} />
          </mesh>
          {/* Lamp Base & Warm Linen Shade */}
          <mesh position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.12, 14]} />
            <meshStandardMaterial color="#d6d3d1" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.78, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 0.22, 16]} />
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#ffba5a"
              emissiveIntensity={isSleeping ? 1.15 : 0.95}
              roughness={0.55}
            />
          </mesh>
          <pointLight
            position={[0, 0.78, 0.1]}
            color="#ffba5c"
            intensity={bedsideLampPower}
            distance={3.8}
            decay={1.8}
          />
        </group>

        {/* Framed Mt. Fuji Mountain Painting Above Bed */}
        <group position={[-2.12, 2.02, -3.41]}>
          <mesh castShadow>
            <boxGeometry args={[0.88, 1.08, 0.04]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.48} />
          </mesh>
          <mesh position={[0, 0, 0.024]}>
            <planeGeometry args={[0.76, 0.96]} />
            <meshStandardMaterial map={textures.mtFuji} roughness={0.55} />
          </mesh>
        </group>

        {/* Round Working Analog Wall Clock */}
        <group
          position={[-1.12, 2.52, -3.4]}
          {...makeFurnitureHandlers('wall_schedule', 'Wall Clock · Tasks & Bills Due', [-1.12, 2.98, -3.15])}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.31, 0.31, 0.04, 28]} />
            <meshStandardMaterial color="#272e3f" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.024]}>
            <circleGeometry args={[0.27, 28]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} />
          </mesh>
          {/* 12 / 3 / 6 / 9 tick marks */}
          {[0, 1, 2, 3].map((idx) => {
            const ang = (idx * Math.PI) / 2;
            return (
              <mesh
                key={idx}
                position={[Math.sin(ang) * 0.21, Math.cos(ang) * 0.21, 0.028]}
                rotation={[0, 0, -ang]}
              >
                <boxGeometry args={[0.016, 0.045, 0.005]} />
                <meshStandardMaterial color="#1e293b" />
              </mesh>
            );
          })}
          {/* Live Hour / Minute / Second Hands */}
          <group ref={clockHourRef} position={[0, 0, 0.031]}>
            <mesh position={[0, 0.065, 0]}>
              <boxGeometry args={[0.02, 0.13, 0.006]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
          </group>
          <group ref={clockMinRef} position={[0, 0, 0.034]}>
            <mesh position={[0, 0.095, 0]}>
              <boxGeometry args={[0.014, 0.19, 0.006]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          </group>
          <group ref={clockSecRef} position={[0, 0, 0.037]}>
            <mesh position={[0, 0.105, 0]}>
              <boxGeometry args={[0.007, 0.21, 0.005]} />
              <meshStandardMaterial color="#ef4444" />
            </mesh>
          </group>
        </group>

        {/* Tall Wooden Bookcase Between Nightstand and Kitchen */}
        <group
          position={[-0.22, 0, -3.12]}
          {...makeFurnitureHandlers('bookshelf', 'Bookshelf · Open Study OS', [-0.22, 2.28, -2.95])}
        >
          <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.92, 2.04, 0.44]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.55} />
          </mesh>
          {/* Shelves & Study OS Topic-Matched Living Books */}
          {[0.24, 0.62, 1.0, 1.38, 1.76].map((sy, idx) => {
            const shelfSlice =
              bookshelfBooks && sy < 1.6 ? bookshelfBooks.slice(idx * 9, (idx + 1) * 9) : null;
            return (
              <group key={idx}>
                <mesh position={[0, sy, 0.02]}>
                  <boxGeometry args={[0.84, 0.03, 0.42]} />
                  <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
                </mesh>
                {sy < 1.6 &&
                  (shelfSlice ? (
                    <group position={[-0.36, sy + 0.02, 0.1]}>
                      {shelfSlice.map((bk, bIdx) => {
                        const bh = 0.22 * bk.heightScale;
                        return (
                          <mesh key={bIdx} position={[bIdx * 0.072, bh / 2, 0]} castShadow>
                            <boxGeometry args={[0.056, bh, 0.18]} />
                            <meshStandardMaterial color={bk.color} roughness={0.55} />
                          </mesh>
                        );
                      })}
                    </group>
                  ) : (
                    <BookRow position={[-0.36, sy + 0.02, 0.1]} count={14} heightScale={1.08} />
                  ))}
              </group>
            );
          })}
          <PottedPlant position={[0.2, 2.04, 0]} scale={0.72} />
        </group>
      </group>

      {/* ===================== 5. ZONE 3: KITCHEN (RIGHT-BACK) ===================== */}
      <group {...makeZoneHandlers('kitchen')}>
        {(hoveredZone === 'kitchen' || activeZone === 'kitchen') && (
          <mesh position={[1.55, 0.015, -2.02]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.68, 32]} />
            <meshBasicMaterial
              color={hoveredZone === 'kitchen' ? '#fbbf24' : '#818cf8'}
              transparent
              opacity={0.45}
            />
          </mesh>
        )}

        <group position={[1.52, 0, -3.02]}>
          {/* Lower Wood Cabinets */}
          <mesh position={[-0.26, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.68, 0.88, 0.72]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.52} />
          </mesh>
          {/* Dark Slate Granite Countertop */}
          <mesh position={[0.04, 0.9, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[2.32, 0.06, 0.78]} />
            <meshStandardMaterial color="#2c3340" roughness={0.32} metalness={0.2} />
          </mesh>

          {/* Upper Wood Cabinets & Microwave Cubby */}
          <mesh position={[-0.24, 2.28, -0.14]} castShadow>
            <boxGeometry args={[1.7, 0.76, 0.42]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.52} />
          </mesh>
          <mesh position={[0.82, 2.02, -0.14]} castShadow>
            <boxGeometry args={[0.58, 0.5, 0.42]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.55} />
          </mesh>
          {/* Built-in Upper Microwave */}
          <mesh position={[0.82, 2.02, -0.06]}>
            <boxGeometry args={[0.46, 0.34, 0.34]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.4} />
          </mesh>
          <mesh position={[0.78, 2.02, 0.115]}>
            <planeGeometry args={[0.28, 0.22]} />
            <meshStandardMaterial color="#0f172a" roughness={0.15} emissive="#38bdf8" emissiveIntensity={0.25} />
          </mesh>

          {/* Warm Under-Cabinet LED Strip Light */}
          <mesh position={[-0.1, 1.88, -0.16]}>
            <boxGeometry args={[1.85, 0.03, 0.06]} />
            <meshStandardMaterial color="#fde68a" emissive="#ffb94d" emissiveIntensity={2.1} />
          </mesh>
          <pointLight
            position={[0.1, 1.55, 0.05]}
            color="#ffc366"
            intensity={underCabinetPower}
            distance={4.2}
            decay={1.8}
          />

          {/* Stainless Sink + Gooseneck Faucet */}
          <group position={[-0.48, 0.935, 0.02]}>
            <mesh>
              <boxGeometry args={[0.56, 0.02, 0.42]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.22} />
            </mesh>
            <mesh position={[0, 0.014, 0]}>
              <boxGeometry args={[0.46, 0.015, 0.32]} />
              <meshStandardMaterial color="#475569" metalness={0.65} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.14, -0.18]}>
              <cylinderGeometry args={[0.015, 0.018, 0.26, 10]} />
              <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.26, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.08, 0.014, 8, 16, Math.PI]} />
              <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
            </mesh>
          </group>

          {/* Coffee Maker & Heated Carafe + Live Brew Steam */}
          <group
            position={[0.16, 0.93, 0.02]}
            {...makeFurnitureHandlers('kitchen_dining', 'Kitchen · Break or Log Expense', [1.68, 1.48, -2.95])}
          >
            <mesh position={[0, 0.17, -0.04]} castShadow>
              <boxGeometry args={[0.24, 0.34, 0.26]} />
              <meshStandardMaterial color="#18181b" roughness={0.35} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.1, 0.06]}>
              <cylinderGeometry args={[0.075, 0.08, 0.16, 14]} />
              <meshStandardMaterial color="#3b1d0e" roughness={0.2} transparent opacity={0.85} />
            </mesh>
            {isBrewingCoffee && (
              <group ref={steamGroupRef} position={[0, 0.36, 0.06]}>
                {[0, 1, 2].map((s) => (
                  <mesh key={s} position={[0, s * 0.08, 0]}>
                    <sphereGeometry args={[0.035, 8, 8]} />
                    <meshBasicMaterial color="#f8fafc" transparent opacity={0.42} />
                  </mesh>
                ))}
              </group>
            )}
          </group>

          {/* Countertop Toaster Oven + Brushed Stainless Mini-Fridge */}
          <mesh position={[0.78, 1.08, 0.04]} castShadow>
            <boxGeometry args={[0.42, 0.28, 0.32]} />
            <meshStandardMaterial color="#d4d4d8" metalness={0.55} roughness={0.32} />
          </mesh>
          <mesh position={[0.84, 0.44, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[0.56, 0.86, 0.68]} />
            <meshStandardMaterial color="#b4becb" metalness={0.68} roughness={0.28} />
          </mesh>

          {/* Kitchen Plants (Cabinet tops + counter herb + tall corner pot) */}
          <PottedPlant position={[-0.95, 0.93, 0.12]} scale={0.55} />
          <PottedPlant position={[-0.78, 2.66, -0.1]} scale={0.82} trailing />
          <PottedPlant position={[0.84, 2.27, -0.1]} scale={0.62} />
        </group>

        {/* Tall Potted Plant Beside Fridge */}
        <PottedPlant position={[2.46, 0, -2.02]} scale={1.15} potColor="#e5e0d8" />
      </group>

      {/* ===================== 6. ZONE 4: DINING TABLE & FRONT CONSOLE ===================== */}
      <group {...makeZoneHandlers('dining')}>
        {(hoveredZone === 'dining' || activeZone === 'dining') && (
          <mesh position={[-0.15, 0.015, 0.95]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.92, 1.04, 32]} />
            <meshBasicMaterial
              color={hoveredZone === 'dining' ? '#fbbf24' : '#818cf8'}
              transparent
              opacity={0.42}
            />
          </mesh>
        )}

        {/* Patterned Blue-Grey Geometric Rug */}
        <mesh position={[-0.1, 0.008, 0.95]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2.65, 2.15]} />
          <meshStandardMaterial map={textures.diamondRug} roughness={0.9} />
        </mesh>

        {/* Square Wooden Dining Table + 4 Chairs */}
        <group
          position={[-0.15, 0, 0.95]}
          {...makeFurnitureHandlers('kitchen_dining', 'Dining · Break or Log Expense', [-0.15, 1.28, 0.95])}
        >
          <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.18, 0.06, 1.18]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.45} />
          </mesh>
          {[
            [-0.48, -0.48],
            [0.48, -0.48],
            [-0.48, 0.48],
            [0.48, 0.48],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.36, lz]} castShadow>
              <boxGeometry args={[0.07, 0.72, 0.07]} />
              <meshStandardMaterial color={OAK_DARK} roughness={0.55} />
            </mesh>
          ))}
          {/* Centerpiece Plant & Ceramic Mug/Plate */}
          <PottedPlant position={[0, 0.77, 0]} scale={0.62} />
          <mesh position={[0, 0.78, -0.34]}>
            <cylinderGeometry args={[0.13, 0.11, 0.02, 16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          </mesh>
          <mesh position={[0.2, 0.81, -0.34]}>
            <cylinderGeometry args={[0.04, 0.036, 0.08, 12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.4} />
          </mesh>

          {/* 3 Wooden Dining Chairs (Back side open/aligned for avatar seat!) */}
          {[
            { pos: [0, 0, -0.81] as [number, number, number], rotY: 0 }, // Avatar seat side (back)
            { pos: [-0.82, 0, 0.06] as [number, number, number], rotY: Math.PI / 2 },
            { pos: [0.82, 0, 0.06] as [number, number, number], rotY: -Math.PI / 2 },
          ].map((ch, idx) => (
            <group key={idx} position={ch.pos} rotation={[0, ch.rotY, 0]}>
              <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.46, 0.05, 0.44]} />
                <meshStandardMaterial color="#d6d3d1" roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[0.48, 0.04, 0.46]} />
                <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
              </mesh>
              <mesh position={[0, 0.72, -0.2]} castShadow>
                <boxGeometry args={[0.46, 0.48, 0.05]} />
                <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
              </mesh>
              {[
                [-0.2, -0.19],
                [0.2, -0.19],
                [-0.2, 0.19],
                [0.2, 0.19],
              ].map(([cx, cz], li) => (
                <mesh key={li} position={[cx, 0.2, cz]} castShadow>
                  <boxGeometry args={[0.045, 0.4, 0.045]} />
                  <meshStandardMaterial color={OAK_DARK} roughness={0.55} />
                </mesh>
              ))}
            </group>
          ))}
        </group>

        {/* Low Front Bookshelf Console with Glowing Lantern Lamp, Books & Plant */}
        <group
          position={[-2.18, 0, 2.95]}
          {...makeFurnitureHandlers('bookshelf', 'Bookcase · Open Study OS', [-2.18, 1.1, 2.95])}
        >
          <mesh position={[0, 0.29, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.65, 0.58, 0.48]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.52} />
          </mesh>
          <mesh position={[0, 0.59, 0]} castShadow>
            <boxGeometry args={[1.7, 0.04, 0.52]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.48} />
          </mesh>
          <BookRow position={[-0.68, 0.04, 0.12]} count={9} heightScale={1.05} />
          <BookRow position={[0.04, 0.04, 0.12]} count={6} heightScale={0.95} />
          {/* Warm Glowing Lantern Lamp (Celebrates at 4+ Focus Cycles) */}
          <group position={[0.14, 0.61, 0]}>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.09, 0.11, 0.24, 14]} />
              <meshStandardMaterial
                color="#fef3c7"
                emissive={hasFourCycleLantern ? '#fbbf24' : '#ffae42'}
                emissiveIntensity={hasFourCycleLantern ? 2.5 : 1.65}
                roughness={0.45}
              />
            </mesh>
            {hasFourCycleLantern && (
              <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.17, 0.014, 8, 24]} />
                <meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={1.8} />
              </mesh>
            )}
            <pointLight position={[0, 0.24, 0]} color="#ffb347" intensity={lanternPower} distance={hasFourCycleLantern ? 4.8 : 3.4} decay={2} />
          </group>
          <PottedPlant position={[0.52, 0.61, 0]} scale={0.72} />
        </group>
      </group>

      {/* ===================== 7. ZONE 5: WASHROOM ALCOVE (FAR-RIGHT) ===================== */}
      <group {...makeZoneHandlers('washroom')}>
        {(hoveredZone === 'washroom' || activeZone === 'washroom') && (
          <mesh position={[4.02, 0.095, -1.05]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.52, 0.64, 32]} />
            <meshBasicMaterial
              color={hoveredZone === 'washroom' ? '#fbbf24' : '#818cf8'}
              transparent
              opacity={0.48}
            />
          </mesh>
        )}

        {/* Raised Washroom Tiled Floor (x=2.85..5.18, z=-3.4..+2.85, y=0.08) */}
        <mesh position={[4.02, 0.04, -0.28]} receiveShadow>
          <boxGeometry args={[2.38, 0.08, 6.26]} />
          <meshStandardMaterial map={textures.bathTile} roughness={0.28} />
        </mesh>

        {/* Exterior Dark Bath Mat at Open Threshold */}
        <mesh position={[2.32, 0.01, 1.72]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.68, 0.52]} />
          <meshStandardMaterial color="#1e2432" roughness={0.95} />
        </mesh>

        {/* Tiled Washroom Partition Wall (x=2.82, z=-3.45..+0.92 — open doorway z>0.92!) */}
        <mesh position={[2.82, 1.58, -1.28]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 3.16, 4.4]} />
          <meshStandardMaterial map={textures.bathWallTile} roughness={0.45} />
        </mesh>
        <mesh position={[2.82, 3.18, -1.28]}>
          <boxGeometry args={[0.2, 0.06, 4.44]} />
          <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.55} />
        </mesh>

        {/* Right Outer Washroom Tiled Wall (x=5.22) */}
        <mesh position={[5.22, 1.58, -0.28]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 3.16, 6.3]} />
          <meshStandardMaterial map={textures.bathWallTile} roughness={0.45} />
        </mesh>
        <mesh position={[5.22, 3.18, -0.28]}>
          <boxGeometry args={[0.22, 0.06, 6.34]} />
          <meshStandardMaterial color={CUT_CAP_NAVY} roughness={0.55} />
        </mesh>

        {/* Glass Corner Shower Enclosure (x=2.92..4.02, z=-3.38..-1.85) */}
        <group position={[3.46, 0.08, -2.6]}>
          {/* White Shower Pan Base */}
          <mesh position={[0, 0.03, 0]} receiveShadow>
            <boxGeometry args={[1.08, 0.06, 1.48]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.3} />
          </mesh>
          {/* Clear Glass Shower Door & Side Glass Panel */}
          <mesh position={[0, 1.15, 0.74]}>
            <boxGeometry args={[1.06, 2.2, 0.025]} />
            <meshPhysicalMaterial color="#dff4ff" transparent opacity={0.28} roughness={0.08} metalness={0.08} />
          </mesh>
          <mesh position={[0.53, 1.15, 0]}>
            <boxGeometry args={[0.025, 2.2, 1.48]} />
            <meshPhysicalMaterial color="#dff4ff" transparent opacity={0.25} roughness={0.08} metalness={0.08} />
          </mesh>
          {/* Chrome Frame Rails */}
          <mesh position={[0, 2.24, 0.74]}>
            <boxGeometry args={[1.1, 0.04, 0.04]} />
            <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0.53, 2.24, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.5]} />
            <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
          </mesh>
          {/* Rainfall Overhead Showerhead & Corner Caddy */}
          <mesh position={[0, 2.18, -0.25]}>
            <cylinderGeometry args={[0.14, 0.14, 0.03, 16]} />
            <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
          </mesh>
          <pointLight position={[0, 2.35, 0]} color="#ffe2ad" intensity={showerLightPower} distance={3.5} decay={1.8} />
        </group>

        {/* Backlit Circular LED Mirror on Right Wall */}
        <group position={[5.1, 1.85, -1.05]} rotation={[0, -Math.PI / 2, 0]}>
          {/* Warm LED Halo Ring */}
          <mesh position={[0, 0, -0.01]}>
            <ringGeometry args={[0.42, 0.49, 36]} />
            <meshStandardMaterial color="#fde68a" emissive="#ffc46b" emissiveIntensity={2.0} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <circleGeometry args={[0.42, 36]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.08} />
          </mesh>
          <pointLight position={[0, 0, 0.35]} color="#ffd599" intensity={isSleeping ? 0.3 : 1.3} distance={3.2} decay={2} />
        </group>

        {/* Wooden Vanity + White Ceramic Vessel Sink */}
        <group position={[4.76, 0.08, -1.05]}>
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.64, 0.84, 0.88]} />
            <meshStandardMaterial color={OAK_WOOD} roughness={0.5} />
          </mesh>
          {/* White Vessel Basin */}
          <mesh position={[-0.04, 0.93, 0]} castShadow>
            <boxGeometry args={[0.46, 0.18, 0.56]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.2} />
          </mesh>
          <mesh position={[-0.04, 1.025, 0]}>
            <boxGeometry args={[0.38, 0.02, 0.48]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.25} />
          </mesh>
          {/* Faucet & Small Plant */}
          <mesh position={[0.2, 0.94, 0]}>
            <cylinderGeometry args={[0.018, 0.022, 0.2, 10]} />
            <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
          </mesh>
          <PottedPlant position={[0.12, 0.84, -0.34]} scale={0.48} />
        </group>

        {/* Blue Bath Mat in Front of Vanity */}
        <mesh position={[4.02, 0.09, -1.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.56, 0.92]} />
          <meshStandardMaterial color="#2563eb" roughness={0.9} />
        </mesh>

        {/* Chrome Towel Rack + Woven Laundry Basket */}
        <group position={[5.08, 1.15, 0.25]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.65, 10]} />
            <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[-0.04, -0.22, -0.1]}>
            <boxGeometry args={[0.05, 0.44, 0.28]} />
            <meshStandardMaterial color="#dbeafe" roughness={0.85} />
          </mesh>
          <mesh position={[-0.04, -0.22, 0.16]}>
            <boxGeometry args={[0.05, 0.4, 0.22]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.85} />
          </mesh>
        </group>

        <mesh position={[4.76, 0.34, 0.58]} castShadow receiveShadow>
          <cylinderGeometry args={[0.24, 0.19, 0.52, 16]} />
          <meshStandardMaterial color="#b48358" roughness={0.88} />
        </mesh>
      </group>

      {/* ===================== 6. DYNAMIC CLUTTER, UPGRADES, LIVING SURFACES & SEASONS ===================== */}
      <StudyDeskClutter clutterLevel={clutterLevel} />
      <MyHomeUnlockedDecor
        unlocks={
          seasonState.forceFairyLights ? { ...unlocks, fairyLights: true } : unlocks
        }
        kitchenGroupPosition={[1.52, 0, -3.02]}
        chairGroupPosition={[-3.32, 0, 1.05]}
        chairRotationY={-Math.PI / 2}
      />
      <MyHomeWindowRain enabled={isRaining || seasonState.showRainWindow} />
      <LiveExamCountdownFrame
        summary={examSummary}
        isVisiting={isVisiting}
        onClickFrame={() => onClickFurniture?.('exam_frame')}
      />
      <SeasonalAndSpecialProps
        seasonState={seasonState}
        isRainingNow={isRaining || seasonState.showRainWindow}
      />
      <OutForClassDoorPlacard
        visible={outOfRoom.visible}
        label={outOfRoom.label}
      />

      {/* ===================== 7. BATCH 3 & 4 PERSONAL OS PROPS & EXPANSIONS ===================== */}
      <VaultSafeProp
        state={vaultSafe}
        onClick={() => onClickFurniture?.('vault_safe')}
      />
      <DoorstepParcelAndMailProp
        state={deliveries}
        onClick={() => onClickFurniture?.('parcel_mail')}
      />
      <WallMiniWhiteboardProp
        dataUrl={whiteboardPreview.dataUrl}
        sketchTitle={whiteboardPreview.title}
        isVisiting={isVisiting}
        onClick={() => onClickFurniture?.('mini_whiteboard')}
      />
      <FlowStateGoldenAuraProp active={isFlowStateActive} />
      <DoomscrollTaxJarProp
        state={doomscrollJar}
        onClick={() => onClickFurniture?.('doomscroll_jar')}
      />
      <TimeCapsuleChestProp
        state={timeCapsuleChest}
        onClick={() => onClickFurniture?.('time_capsule')}
      />
      <VinylTurntableProp
        isPlaying={isVinylPlaying}
        onClick={() => onClickFurniture?.('vinyl_player')}
      />
      <HydrationBottleProp
        state={hydrationState}
        onClick={() => onClickFurniture?.('hydration_bottle')}
      />
      <ApartmentExpansionStructure
        expansion={apartmentExpansion}
        onClickBalcony={() => onClickFurniture?.('balcony_chair')}
      />

      {hoveredFurniture && (
        <Html position={hoveredFurniture.pos} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/90 border border-indigo-400/45 text-[10px] font-medium text-indigo-100 whitespace-nowrap shadow-lg backdrop-blur-md">
            {hoveredFurniture.label}
          </div>
        </Html>
      )}
    </group>
    </PlantStageContext.Provider>
  );
};

