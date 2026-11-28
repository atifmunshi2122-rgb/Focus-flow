import React, { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BatteryCharging,
  BedDouble,
  Bot,
  Camera,
  ChevronDown,
  ChevronUp,
  Coffee,
  Eye,
  GraduationCap,
  Hand,
  Heart,
  Home,
  LampDesk,
  Laptop,
  Maximize2,
  Moon,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  ShowerHead,
  Smile,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Target,
  Timer,
  UserPlus,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { computeGamificationFromRealData } from '../../features/gamification/firestoreGamification.ts';
import { BINAURAL_PRESETS, binauralBeatsEngine } from '../../lib/binauralBeats.ts';
import type { AmbientPreset } from '../../lib/ambientAudio.ts';
import {
  DEFAULT_AVATAR_ID,
  getAvatarCatalogEntry,
  validateAndSanitizeAvatarConfig,
  type UserAvatarConfig,
} from '../../features/avatar/avatar-catalog.ts';
import type { RoomLighting } from '../../features/study-room/customization-types.ts';
import type { RigCapabilities } from '../../features/study-room/humanoidRigController.ts';
import { resolveStudyAvatarIdentity } from '../../lib/studyAvatarRegistry.ts';
import {
  fetchSquadMemberProfiles,
  isProfileStudyingLive,
  listUserSquads,
  updateUserAvatarConfig,
} from '../../lib/leaderboardService.ts';
import { getTodayDateString } from '../../lib/dateTime.ts';
import type {
  Bill,
  ExpenseCategory,
  ExpenseTransaction,
  FocusSession,
  SavingsGoal,
  Task,
  TimeBlock,
} from '../../types/index.ts';
import type { StudyExam, StudySubject, StudyTopic } from '../../types/study.ts';
import type { DoomscrollTaxEntry, SkillNode, TimeCapsuleLetter } from '../../types/features15.ts';
import {
  HOME_ZONES,
  clampWalkableFloorPosition,
  computeHomeWaypointPath,
  computeObstacleAwareFloorPath,
  deriveDefaultLightingForHour,
  deriveHomeRoutineState,
  getZonedHourMinute,
  resolveHomeZoneConfig,
  type HomeZoneId,
} from '../../features/home/homeRoutineEngine.ts';
import {
  DEFAULT_CUSTOM_FRAMES,
  DEFAULT_HOME_SHOP_STATE,
  computeConstellationStars,
  computeFocusAquariumState,
  computeFocusCoinsBalance,
  computeMonthlyBudgetSummary,
  computeStreakHeatmapDays,
  computeSunMoonSkyPosition,
  placeOrMoveShopItem,
  purchaseShopItem,
  removePlacedShopItem,
  rotatePlacedShopItem,
  type ConstellationStar,
  type CustomWallFrameConfig,
  type FocusAquariumState,
  type HeatmapCell,
  type HomeShopState,
  type MonthlyBudgetSummary,
  type PlacedShopItem,
  type ShopItemId,
  type SunMoonSkyState,
} from '../../features/home/homeShopAndLayout.ts';
import type { AvatarEmote, AvatarEmoteEvent } from '../../features/study-room/types.ts';
import {
  MORNING_SEQUENCE_TOTAL_SECONDS,
  buildVisitorHomeFromLeaderboardProfile,
  buildVisitorHomeFromVaultPartner,
  computeApartmentExpansion,
  computeCalendarSeasonState,
  computeDailyWrapUpStats,
  computeDoomscrollJarState,
  computeDoorstepDeliveries,
  computeExamAndTargetSummary,
  computeFlowStateStatus,
  computeHomeUnlocks,
  computeHydrationHabitState,
  computeInitialSimsNeeds,
  computeLivingBookshelfState,
  computeLivingPlantState,
  computeRoomCleanliness,
  computeTimeCapsuleChestState,
  computeVaultSafeState,
  getMorningSequenceStep,
  getNeedStatusLabel,
  isHydrationOrCoffeeHabitTitle,
  selectCorkboardTasks,
  stepSimsNeeds,
  summarizeTodayHabits,
  type ApartmentExpansionState,
  type ApartmentTierOverride,
  type CalendarSeasonState,
  type CorkboardTaskNote,
  type DoomscrollJarState,
  type DoorstepDeliveriesState,
  type ExamCountdownSummary,
  type FurnitureShortcutId,
  type HomeDecorUnlocks,
  type HydrationHabitState,
  type LivingBookshelfSlot,
  type LivingPlantStage,
  type PetSpecies,
  type SeasonOverrideMode,
  type SimsNeedsState,
  type TimeCapsuleChestState,
  type VaultSafeState,
  type VisitorHomeTarget,
} from '../../features/home/homeFeaturesEngine.ts';
import StudyAvatar, { preloadStudyAvatarModels, type StudyAvatarActivity } from '../study-room/StudyAvatar.tsx';
import RoomCameraRig, { type RoomCameraMode } from '../study-room/RoomCameraRig.tsx';
import RoomLightingController from '../study-room/RoomLightingController.tsx';
import RoomWeatherEffects from '../study-room/RoomWeatherEffects.tsx';
import { MyHomeApartment } from './MyHomeApartment.tsx';
import {
  HOME_ROOM_CATALOG,
  getHomeRoomTheme,
  isKnownHomeRoomStyle,
  type HomeRoomStyle,
} from '../../features/home/homeRoomCatalog.ts';
import { MyHomePet } from './MyHomePet.tsx';
import {
  CustomWallFramesModal,
  DoomscrollJarModal,
  DoorstepParcelMailModal,
  EndDaySleepModal,
  ExamAndSeasonModal,
  FurnitureShopModal,
  KitchenDiningPopup,
  TimeCapsuleQuickModal,
  UpgradesAndPetModal,
  VisitHomeModal,
  WallSchedulePopup,
} from './MyHomeModals.tsx';
import {
  ArcadeMiniGameModal,
  DreamGlobeModal,
  PaperAirplaneInboxModal,
} from './MyHomeArcadeModal.tsx';
import {
  DREAM_GLOBE_CITIES,
  computeDreamGlobeProgress,
  computeMomentumWeatherOrbState,
  computeVinylRecordRack,
  type DreamGlobeDestination,
  type MomentumWeatherOrbState,
  type PaperAirplaneMessage,
  type VinylRecordSleeve,
} from '../../features/home/homeDreamAndArcade.ts';

type HomeCameraPreset = 'isometric' | 'free' | 'follow' | 'desk_pov' | 'observatory';

const HOME_CAMERA_PRESETS: Record<RoomCameraMode, { position: [number, number, number]; target: [number, number, number] }> = {
  isometric: {
    position: [8.8, 8.6, 10.6],
    target: [0, 0.75, -0.15],
  },
  free: {
    position: [0.2, 6.2, 10.2],
    target: [0, 0.75, -0.15],
  },
  cinematic: {
    position: [6.4, 4.8, 9.2],
    target: [0, 0.9, -0.35],
  },
  desk_pov: {
    position: [-2.65, 1.56, 1.15],
    target: [-4.35, 0.95, 1.05],
  },
  observatory: {
    position: [-5.4, 1.85, 2.2],
    target: [-3.8, 4.7, -5.8],
  },
};

const ACTIVITY_LABELS: Partial<Record<StudyAvatarActivity, string>> = {
  typing: 'Focusing on Laptop',
  studying: 'Studying at Desk',
  reading: 'Reading Books',
  writing: 'Writing Notes',
  sleeping: 'Sleeping Soundly',
  eating: 'Enjoying a Meal',
  coffee: 'Brewing & Sipping Coffee',
  freshening_up: 'Freshening Up',
  walking: 'Walking Across Room',
  idle: 'Relaxing',
};

const LOCAL_AVATAR_STORAGE_KEY = 'ff_user_avatar_config';

function shortestAngleLerp(current: number, target: number, alpha: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * alpha;
}

function loadUserAvatarConfig(activeUid: string, settingsConfig?: UserAvatarConfig | null): UserAvatarConfig {
  if (settingsConfig && typeof settingsConfig === 'object') {
    return validateAndSanitizeAvatarConfig(settingsConfig);
  }
  try {
    const raw = localStorage.getItem(`${LOCAL_AVATAR_STORAGE_KEY}_${activeUid}`);
    if (raw) {
      return validateAndSanitizeAvatarConfig(JSON.parse(raw));
    }
  } catch {
    // ignore storage read error
  }
  return validateAndSanitizeAvatarConfig({ avatarId: DEFAULT_AVATAR_ID });
}

class HomeWebGLErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface HomeSceneContentProps {
  avatarUrl: string;
  avatarName: string;
  customization: UserAvatarConfig['customization'];
  isStaticUnrigged: boolean;
  routineState: ReturnType<typeof deriveHomeRoutineState>;
  lighting: RoomLighting;
  roomStyle: HomeRoomStyle;
  cameraPreset: HomeCameraPreset;
  resetCounter: number;
  isWalking: boolean;
  clutterLevel: 0 | 1 | 2 | 3;
  lampDimFactor: number;
  unlocks: HomeDecorUnlocks;
  isRaining: boolean;
  petSpecies: PetSpecies;
  petStreakDays: number;
  hasPetCollar: boolean;
  hasPetBed: boolean;
  isVisiting: boolean;
  corkboardTasks: CorkboardTaskNote[];
  examSummary: ExamCountdownSummary;
  seasonState: CalendarSeasonState;
  laptopScreen: {
    timerLabel: string;
    modeLabel: string;
    isRunning: boolean;
    progressRatio: number;
    subtitle: string;
  };
  outOfRoom: { visible: boolean; label: string };
  plantStage: LivingPlantStage;
  vaultSafe: VaultSafeState;
  deliveries: DoorstepDeliveriesState;
  whiteboardPreview: { dataUrl: string | null; title?: string };
  isFlowStateActive: boolean;
  hasFourCycleLantern: boolean;
  doomscrollJar: DoomscrollJarState;
  bookshelfBooks: LivingBookshelfSlot[];
  timeCapsuleChest: TimeCapsuleChestState;
  isVinylPlaying: boolean;
  hydrationState: HydrationHabitState;
  apartmentExpansion: ApartmentExpansionState;
  hideAvatarForPov: boolean;
  walkTarget: { pos: [number, number, number]; seq: number } | null;
  shopPlacedItems: PlacedShopItem[];
  layoutEditMode: boolean;
  selectedShopItemId: ShopItemId | null;
  skyState: SunMoonSkyState;
  showFireworks: boolean;
  breathingOrb: { active: boolean; secondsLeft: number };
  smartTvData: {
    todayFocusMinutes: number;
    dailyGoalMinutes: number;
    budgetSummary: MonthlyBudgetSummary;
    heatmap: HeatmapCell[];
    streakDays: number;
  };
  focusAquarium: FocusAquariumState;
  constellationStars: ConstellationStar[];
  isObservatoryMode: boolean;
  totalSavedPaise: number;
  coinDropSeq: number;
  customFrames: CustomWallFrameConfig[];
  isStandingDesk: boolean;
  dailyTargetPct: number;
  paperAirplaneState: { unreadCount: number; latestMessage: PaperAirplaneMessage | null };
  dreamGlobe: { destination: DreamGlobeDestination; progress: number };
  vinylSleeves: VinylRecordSleeve[];
  activeAmbientPreset: string;
  weatherOrbState: MomentumWeatherOrbState;
  onSelectVinylSleeve: (sleeve: VinylRecordSleeve) => void;
  onDropBonusCoin: () => void;
  petReactionCue: { type: 'pet' | 'feed'; seq: number } | null;
  coStudyGuests: VisitorHomeTarget[];
  guestEmoteEvent: AvatarEmoteEvent | null;
  onRegisterCapture?: (fn: (() => string) | null) => void;
  onWalkingChange: (walking: boolean) => void;
  onSelectZone: (zone: HomeZoneId) => void;
  onClickFloor: (x: number, z: number) => void;
  onSelectShopItem: (id: ShopItemId) => void;
  onClickFurniture: (shortcut: FurnitureShortcutId) => void;
  onCompleteCorkboardTask: (taskId: string) => void;
  onClickPet: () => void;
}

const HomeSceneContent: React.FC<HomeSceneContentProps> = ({
  avatarUrl,
  avatarName,
  customization,
  isStaticUnrigged,
  routineState,
  lighting,
  roomStyle,
  cameraPreset,
  resetCounter,
  isWalking,
  clutterLevel,
  lampDimFactor,
  unlocks,
  isRaining,
  petSpecies,
  petStreakDays,
  hasPetCollar,
  hasPetBed,
  isVisiting,
  corkboardTasks,
  examSummary,
  seasonState,
  laptopScreen,
  outOfRoom,
  plantStage,
  vaultSafe,
  deliveries,
  whiteboardPreview,
  isFlowStateActive,
  hasFourCycleLantern,
  doomscrollJar,
  bookshelfBooks,
  timeCapsuleChest,
  isVinylPlaying,
  hydrationState,
  apartmentExpansion,
  hideAvatarForPov,
  walkTarget,
  shopPlacedItems,
  layoutEditMode,
  selectedShopItemId,
  skyState,
  showFireworks,
  breathingOrb,
  smartTvData,
  focusAquarium,
  constellationStars,
  isObservatoryMode,
  totalSavedPaise,
  coinDropSeq,
  customFrames,
  isStandingDesk,
  dailyTargetPct,
  paperAirplaneState,
  dreamGlobe,
  vinylSleeves,
  activeAmbientPreset,
  weatherOrbState,
  onSelectVinylSleeve,
  onDropBonusCoin,
  petReactionCue,
  coStudyGuests,
  guestEmoteEvent,
  onRegisterCapture,
  onWalkingChange,
  onSelectZone,
  onClickFloor,
  onSelectShopItem,
  onClickFurniture,
  onCompleteCorkboardTask,
  onClickPet,
}) => {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    onRegisterCapture?.(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    });
    return () => onRegisterCapture?.(null);
  }, [gl, scene, camera, onRegisterCapture]);
  const initialCfg = resolveHomeZoneConfig(routineState.zone, roomStyle);
  const startPos: [number, number, number] = isStaticUnrigged ? initialCfg.approachPosition : initialCfg.anchorPosition;

  const walkerRef = useRef<THREE.Group>(null);
  const currentPosRef = useRef<[number, number, number]>([...startPos]);
  const currentRotYRef = useRef<number>(initialCfg.targetRotationY);
  const queueRef = useRef<Array<[number, number, number]>>([]);
  const walkingFlagRef = useRef<boolean>(false);
  const followPointRef = useRef<[number, number, number] | null>([...startPos]);
  const [rigCaps, setRigCaps] = useState<RigCapabilities | null>(null);

  const mountedZoneRef = useRef<HomeZoneId>(routineState.zone);
  const prevRoomStyleRef = useRef<HomeRoomStyle>(roomStyle);
  const wasdKeysRef = useRef<Record<string, boolean>>({});
  const isWasdMovingRef = useRef(false);

  // Keyboard WASD / Arrow movement listener (disabled while typing in inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        wasdKeysRef.current[k] = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      wasdKeysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Trigger clamped obstacle-aware floor walk whenever user clicks a walkable floor coordinate
  useEffect(() => {
    if (!walkTarget || isVisiting) return;
    const clampedTarget = clampWalkableFloorPosition(walkTarget.pos[0], walkTarget.pos[2], roomStyle);
    queueRef.current = computeObstacleAwareFloorPath(
      currentPosRef.current,
      clampedTarget,
      roomStyle
    );
    if (!walkingFlagRef.current) {
      walkingFlagRef.current = true;
      onWalkingChange(true);
    }
  }, [walkTarget?.seq, isVisiting, roomStyle, onWalkingChange]);

  // Trigger smooth waypoint path whenever destination zone, rig type, or roomStyle changes
  useEffect(() => {
    const zoneCfg = resolveHomeZoneConfig(routineState.zone, roomStyle);
    const dest = isStaticUnrigged && zoneCfg.supportsStaticStandingOnlyFallback
      ? zoneCfg.approachPosition
      : zoneCfg.anchorPosition;

    if (prevRoomStyleRef.current !== roomStyle) {
      prevRoomStyleRef.current = roomStyle;
      mountedZoneRef.current = routineState.zone;
      queueRef.current = [];
      currentPosRef.current = dest;
      currentRotYRef.current = zoneCfg.targetRotationY;
      followPointRef.current = dest;
      if (walkerRef.current) {
        walkerRef.current.position.set(dest[0], dest[1], dest[2]);
        walkerRef.current.rotation.y = zoneCfg.targetRotationY;
      }
      if (walkingFlagRef.current) {
        walkingFlagRef.current = false;
        onWalkingChange(false);
      }
      return;
    }

    if (mountedZoneRef.current === routineState.zone && !walkingFlagRef.current) {
      // Snap cleanly on first load or when toggling seated <-> standing fallback on same zone
      const dist = Math.hypot(
        dest[0] - currentPosRef.current[0],
        dest[2] - currentPosRef.current[2]
      );
      if (dist < 0.05) return;
    }

    mountedZoneRef.current = routineState.zone;
    const nextPath = computeHomeWaypointPath(currentPosRef.current, routineState.zone, {
      standingOnlyFallback: isStaticUnrigged && zoneCfg.supportsStaticStandingOnlyFallback,
      roomStyle,
    });
    queueRef.current = nextPath;
    if (nextPath.length > 0 && !walkingFlagRef.current) {
      walkingFlagRef.current = true;
      onWalkingChange(true);
    }
  }, [routineState.zone, isStaticUnrigged, roomStyle, onWalkingChange]);

  useFrame((_, delta) => {
    const walker = walkerRef.current;
    if (!walker) return;

    const clampedDelta = Math.min(0.05, Math.max(0.001, delta));
    const zoneCfg = resolveHomeZoneConfig(routineState.zone, roomStyle);
    const queue = queueRef.current;

    // Free WASD / Arrow walking in own home (outside Desk POV)
    if (!isVisiting && !hideAvatarForPov) {
      const keys = wasdKeysRef.current;
      let moveX = 0;
      let moveZ = 0;
      if (keys['w'] || keys['arrowup']) moveZ -= 1;
      if (keys['s'] || keys['arrowdown']) moveZ += 1;
      if (keys['a'] || keys['arrowleft']) moveX -= 1;
      if (keys['d'] || keys['arrowright']) moveX += 1;

      if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        const speed = 2.35 * clampedDelta;
        const nextClamped = clampWalkableFloorPosition(
          currentPosRef.current[0] + (moveX / len) * speed,
          currentPosRef.current[2] + (moveZ / len) * speed,
          roomStyle
        );
        currentPosRef.current = nextClamped;
        queueRef.current = [];
        const moveYaw = Math.atan2(moveX, moveZ);
        currentRotYRef.current = shortestAngleLerp(currentRotYRef.current, moveYaw, Math.min(1, clampedDelta * 12));
        if (!isWasdMovingRef.current) {
          isWasdMovingRef.current = true;
          walkingFlagRef.current = true;
          onWalkingChange(true);
        }
        walker.position.set(currentPosRef.current[0], currentPosRef.current[1], currentPosRef.current[2]);
        walker.rotation.y = currentRotYRef.current;
        followPointRef.current = currentPosRef.current;
        return;
      } else if (isWasdMovingRef.current) {
        isWasdMovingRef.current = false;
        walkingFlagRef.current = false;
        onWalkingChange(false);
      }
    }

    if (queue.length > 0) {
      const target = queue[0];
      const [cx, cy, cz] = currentPosRef.current;
      const dx = target[0] - cx;
      const dy = target[1] - cy;
      const dz = target[2] - cz;
      const horizDist = Math.hypot(dx, dz);
      const step = 1.9 * clampedDelta;

      if (horizDist <= step + 0.025) {
        currentPosRef.current = [target[0], target[1], target[2]];
        queue.shift();
        if (queue.length === 0 && walkingFlagRef.current) {
          walkingFlagRef.current = false;
          onWalkingChange(false);
        }
      } else {
        const ratio = step / horizDist;
        currentPosRef.current = [
          cx + dx * ratio,
          THREE.MathUtils.lerp(cy, target[1], Math.min(1, clampedDelta * 8)),
          cz + dz * ratio,
        ];
        const moveYaw = Math.atan2(dx, dz);
        currentRotYRef.current = shortestAngleLerp(
          currentRotYRef.current,
          moveYaw,
          Math.min(1, clampedDelta * 10)
        );
      }
    } else {
      // Arrived cleanly: face the zone's natural orientation
      if (routineState.zone === 'study' && !isVisiting && !isStaticUnrigged) {
        const standingPos = getHomeRoomTheme(roomStyle).roomLayout?.standingDeskPos;
        const targetStandX = isStandingDesk && standingPos ? standingPos[0] : zoneCfg.anchorPosition[0];
        const targetStandZ = isStandingDesk && standingPos ? standingPos[2] : zoneCfg.anchorPosition[2];
        currentPosRef.current = [
          THREE.MathUtils.lerp(currentPosRef.current[0], targetStandX, Math.min(1, clampedDelta * 6)),
          currentPosRef.current[1],
          THREE.MathUtils.lerp(currentPosRef.current[2], targetStandZ, Math.min(1, clampedDelta * 6)),
        ];
      }
      currentRotYRef.current = shortestAngleLerp(
        currentRotYRef.current,
        zoneCfg.targetRotationY,
        Math.min(1, clampedDelta * 7)
      );
    }

    walker.position.set(
      currentPosRef.current[0],
      currentPosRef.current[1],
      currentPosRef.current[2]
    );
    walker.rotation.y = currentRotYRef.current;
    followPointRef.current = currentPosRef.current;
  });

  const effectivePoseMode = isWalking
    ? 'standing'
    : isStaticUnrigged
    ? 'standing'
    : isStandingDesk && routineState.zone === 'study' && !isVisiting
    ? 'standing'
    : routineState.poseMode;

  const effectiveActivity: StudyAvatarActivity = isWalking
    ? 'walking'
    : isStaticUnrigged && (routineState.poseMode === 'seated' || routineState.poseMode === 'sleeping')
    ? 'standing'
    : routineState.activity;

  const isRigidChibi = rigCaps?.rigKind === 'rigid_node';
  const avatarScale = isRigidChibi ? 1.18 : 1.0;
  const modelYOffset = isRigidChibi
    ? effectivePoseMode === 'seated'
      ? 0.08
      : 0.0
    : effectivePoseMode === 'sleeping'
    ? 0.02
    : -0.02;

  const nameplateHeight =
    effectivePoseMode === 'sleeping'
      ? 0.78
      : isStaticUnrigged
      ? 1.92
      : isRigidChibi
      ? 1.48
      : 1.66;

  const roomLightingMode: RoomLighting =
    routineState.isSleeping && !isWalking ? 'night' : lighting;

  return (
    <>
      <color attach="background" args={['#071026']} />
      <fog attach="fog" args={['#071026', 20, 42]} />

      <RoomLightingController
        mode={roomLightingMode}
        accentColor={routineState.isSleeping ? '#f59e0b' : '#818cf8'}
      />

      <RoomCameraRig
        mode={cameraPreset === 'follow' ? 'isometric' : cameraPreset}
        followEnabled={cameraPreset === 'follow'}
        followRef={followPointRef}
        minDistance={cameraPreset === 'desk_pov' ? 0.5 : 3.2}
        presetsOverride={HOME_CAMERA_PRESETS}
        resetCounter={resetCounter}
      />

      <RoomWeatherEffects
        weather="clear"
        ambientEffects={lighting !== 'night' && !routineState.isSleeping}
      />

      <MyHomeApartment
        roomStyle={roomStyle}
        activeZone={routineState.zone}
        lightingMode={roomLightingMode}
        isSleeping={routineState.isSleeping && !isWalking}
        isStudying={routineState.isStudying && !isWalking}
        isBrewingCoffee={routineState.zone === 'kitchen' && !isWalking}
        clutterLevel={clutterLevel}
        lampDimFactor={lampDimFactor}
        unlocks={unlocks}
        isRaining={isRaining}
        isVisiting={isVisiting}
        corkboardTasks={corkboardTasks}
        examSummary={examSummary}
        seasonState={seasonState}
        laptopScreen={laptopScreen}
        outOfRoom={outOfRoom}
        plantStage={plantStage}
        vaultSafe={vaultSafe}
        deliveries={deliveries}
        whiteboardPreview={whiteboardPreview}
        isFlowStateActive={isFlowStateActive}
        hasFourCycleLantern={hasFourCycleLantern}
        doomscrollJar={doomscrollJar}
        bookshelfBooks={bookshelfBooks}
        timeCapsuleChest={timeCapsuleChest}
        isVinylPlaying={isVinylPlaying}
        hydrationState={hydrationState}
        apartmentExpansion={apartmentExpansion}
        walkTargetPos={walkTarget?.pos || null}
        shopPlacedItems={shopPlacedItems}
        layoutEditMode={layoutEditMode}
        selectedShopItemId={selectedShopItemId}
        skyState={skyState}
        showFireworks={showFireworks}
        breathingOrb={breathingOrb}
        smartTvData={smartTvData}
        focusAquarium={focusAquarium}
        constellationStars={constellationStars}
        isObservatoryMode={isObservatoryMode}
        totalSavedPaise={totalSavedPaise}
        coinDropSeq={coinDropSeq}
        customFrames={customFrames}
        isStandingDesk={isStandingDesk}
        dailyTargetPct={dailyTargetPct}
        paperAirplaneState={paperAirplaneState}
        dreamGlobe={dreamGlobe}
        vinylSleeves={vinylSleeves}
        activeAmbientPreset={activeAmbientPreset}
        weatherOrbState={weatherOrbState}
        onSelectVinylSleeve={onSelectVinylSleeve}
        onDropBonusCoin={onDropBonusCoin}
        onSelectZone={onSelectZone}
        onClickFloor={onClickFloor}
        onSelectShopItem={onSelectShopItem}
        onClickFurniture={onClickFurniture}
        onCompleteCorkboardTask={onCompleteCorkboardTask}
      />

      <MyHomePet
        species={petSpecies}
        hasCollar={hasPetCollar}
        hasLuxuryPetBed={hasPetBed}
        activeZone={routineState.zone}
        isWalking={isWalking}
        avatarGroupRef={walkerRef}
        streakDays={petStreakDays}
        isVisiting={isVisiting}
        reactionCue={petReactionCue}
        onClickPet={onClickPet}
      />

      {/* Co-Study Squad Guests (up to 3 live members) */}
      {!isVisiting &&
        coStudyGuests.slice(0, 3).map((guest, idx) => {
          const spots: Array<{ pos: [number, number, number]; rotY: number }> = [
            { pos: [-0.97, 0, 1.01], rotY: Math.PI / 2 },
            { pos: [0.67, 0, 1.01], rotY: -Math.PI / 2 },
            { pos: [-2.55, 0, 1.75], rotY: -Math.PI / 2 },
          ];
          const spot = spots[idx] || spots[0];
          const gIdentity = resolveStudyAvatarIdentity({
            uid: guest.uid,
            displayName: guest.displayName,
            avatarColor: '#38bdf8',
            avatarConfig: guest.avatarConfig ?? null,
          });
          return (
            <group key={guest.uid} position={spot.pos} rotation={[0, spot.rotY, 0]}>
              <Suspense fallback={null}>
                <StudyAvatar
                  modelUrl={gIdentity.modelUrl}
                  name={guest.displayName}
                  activity={guest.isStudyingLive ? 'typing' : 'idle'}
                  poseMode="seated"
                  customization={gIdentity.customization}
                  isLive={guest.isStudyingLive}
                  subtitle={guest.activeSubject || (guest.isStudyingLive ? 'Co-Studying' : 'On Break')}
                  emoteEvent={guestEmoteEvent}
                />
              </Suspense>
            </group>
          );
        })}

      <group
        ref={walkerRef}
        position={startPos}
        rotation={[0, initialCfg.targetRotationY, 0]}
        visible={!hideAvatarForPov && !outOfRoom.visible}
      >
        <Suspense fallback={null}>
          <StudyAvatar
            modelUrl={avatarUrl}
            name={avatarName}
            activity={effectiveActivity}
            position={[0, 0, 0]}
            rotation={[0, 0, 0]}
            scale={avatarScale}
            modelPosition={[0, modelYOffset, 0]}
            nameplateHeight={nameplateHeight}
            poseMode={effectivePoseMode}
            customization={customization}
            isLive={routineState.isStudying && !isWalking}
            subtitle={isWalking ? 'Walking...' : HOME_ZONES[routineState.zone].statusText}
            onRigInspected={setRigCaps}
          />
        </Suspense>
      </group>
    </>
  );
};

export const MyHomeView: React.FC = () => {
  const {
    user,
    firebaseUser,
    settings,
    updateSettings,
    isRunning,
    timerEngine,
    timerMode,
    timeLeft,
    totalDuration,
    stopwatchElapsed,
    startTimer,
    pauseTimer,
    switchTimerMode,
    setCustomDuration,
    ambientPreset,
    ambientVolume,
    setAmbientSound,
    habits,
    refreshKey,
    triggerRefresh,
    setCurrentTab,
    showToast,
  } = useApp();

  const activeUid = firebaseUser?.uid || user?.id || 'usr_guest';
  const userTimezone = settings?.timezone || 'Asia/Kolkata';

  const [avatarConfig, setAvatarConfig] = useState<UserAvatarConfig>(() =>
    loadUserAvatarConfig(activeUid, settings?.avatarConfig ?? null)
  );

  useEffect(() => {
    setAvatarConfig(loadUserAvatarConfig(activeUid, settings?.avatarConfig ?? null));
  }, [activeUid, settings?.avatarConfig]);

  const userDisplayName = firebaseUser?.displayName?.trim() || user?.name?.trim() || 'You';
  const avatarIdentity = useMemo(
    () =>
      resolveStudyAvatarIdentity({
        uid: activeUid,
        displayName: userDisplayName,
        avatarColor: '#6366f1',
        avatarConfig,
      }),
    [activeUid, userDisplayName, avatarConfig]
  );
  const catalogEntry = useMemo(() => getAvatarCatalogEntry(avatarIdentity.id), [avatarIdentity.id]);
  const isStaticUnrigged = !catalogEntry.hasHumanoidSkeleton;

  useEffect(() => {
    preloadStudyAvatarModels([avatarIdentity.modelUrl]);
  }, [avatarIdentity.modelUrl]);

  // Live time-of-day clock tick every 30s (no AI calls)
  const [clockTick, setClockTick] = useState(() => getZonedHourMinute(userTimezone));
  useEffect(() => {
    setClockTick(getZonedHourMinute(userTimezone));
    const timer = setInterval(() => {
      setClockTick(getZonedHourMinute(userTimezone));
    }, 30_000);
    return () => clearInterval(timer);
  }, [userTimezone]);

  // Detect live habit completions & hydration/coffee ticks
  const [habitCompletedRecently, setHabitCompletedRecently] = useState(false);
  const [hydrationCompletedRecently, setHydrationCompletedRecently] = useState(false);
  const todayStr = getTodayDateString(userTimezone);
  const completedTodayCount = useMemo(
    () =>
      (habits || []).filter(
        (h) => !h.deletedAt && !h.archived && (h.completedDates || []).includes(todayStr)
      ).length,
    [habits, todayStr]
  );
  const completedHydrationTodayCount = useMemo(
    () =>
      (habits || []).filter(
        (h) =>
          !h.deletedAt &&
          !h.archived &&
          isHydrationOrCoffeeHabitTitle(`${h.title} ${h.category || ''}`) !== null &&
          (h.completedDates || []).includes(todayStr)
      ).length,
    [habits, todayStr]
  );
  const prevHabitCountRef = useRef<number>(completedTodayCount);
  const prevHydrationCountRef = useRef<number>(completedHydrationTodayCount);
  useEffect(() => {
    if (completedHydrationTodayCount > prevHydrationCountRef.current) {
      setHydrationCompletedRecently(true);
      const ht = setTimeout(() => setHydrationCompletedRecently(false), 18_000);
      prevHydrationCountRef.current = completedHydrationTodayCount;
      prevHabitCountRef.current = completedTodayCount;
      return () => clearTimeout(ht);
    }
    prevHydrationCountRef.current = completedHydrationTodayCount;

    if (completedTodayCount > prevHabitCountRef.current) {
      setHabitCompletedRecently(true);
      const t = setTimeout(() => setHabitCompletedRecently(false), 45_000);
      prevHabitCountRef.current = completedTodayCount;
      return () => clearTimeout(t);
    }
    prevHabitCountRef.current = completedTodayCount;
  }, [completedTodayCount, completedHydrationTodayCount]);

  // 10-second Morning Opening Sequence (plays once per morning or via replay button)
  const [morningElapsedSec, setMorningElapsedSec] = useState<number | null>(() => {
    try {
      const hourNow = getZonedHourMinute(userTimezone).hour;
      const key = `focusflow_home_morning_${activeUid}_${todayStr}`;
      if (hourNow >= 5 && hourNow < 12 && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        return 0;
      }
    } catch {
      // ignore storage error
    }
    return null;
  });

  useEffect(() => {
    if (morningElapsedSec === null) return;
    if (morningElapsedSec >= MORNING_SEQUENCE_TOTAL_SECONDS) {
      setMorningElapsedSec(null);
      return;
    }
    const id = window.setInterval(() => {
      setMorningElapsedSec((prev) =>
        prev === null ? null : prev + 0.25 >= MORNING_SEQUENCE_TOTAL_SECONDS ? null : prev + 0.25
      );
    }, 250);
    return () => window.clearInterval(id);
  }, [morningElapsedSec !== null]);

  const activeMorningFrame = useMemo(
    () => (morningElapsedSec === null ? null : getMorningSequenceStep(morningElapsedSec)),
    [morningElapsedSec]
  );

  // Track uninterrupted Focus session (Flow State zero-pause detection)
  const [wasPausedThisRun, setWasPausedThisRun] = useState(false);
  const wasRunningRef = useRef(isRunning);
  useEffect(() => {
    const prevRunning = wasRunningRef.current;
    wasRunningRef.current = isRunning;
    if (prevRunning && !isRunning) {
      const partialRun =
        timerEngine === 'stopwatch'
          ? stopwatchElapsed > 3
          : timeLeft > 0 && timeLeft < totalDuration - 2;
      if (partialRun) {
        setWasPausedThisRun(true);
      }
    } else if (!prevRunning && isRunning) {
      const freshRun =
        timerEngine === 'stopwatch' ? stopwatchElapsed <= 3 : timeLeft >= totalDuration - 2;
      if (freshRun) {
        setWasPausedThisRun(false);
      }
    }
  }, [isRunning, timerEngine, timeLeft, totalDuration, stopwatchElapsed]);

  const [autoRoutine, setAutoRoutine] = useState(true);
  const [manualZone, setManualZone] = useState<HomeZoneId>('study');
  const [lighting, setLighting] = useState<RoomLighting>(() =>
    deriveDefaultLightingForHour(clockTick.hour)
  );
  const [roomStyle, setRoomStyle] = useState<HomeRoomStyle>(() => {
    try {
      const saved = localStorage.getItem(`focusflow_home_room_style_${activeUid}`);
      if (isKnownHomeRoomStyle(saved)) return saved;
    } catch {
      // ignore
    }
    return 'classic';
  });
  const [cameraPreset, setCameraPreset] = useState<HomeCameraPreset>('isometric');
  const [zenPovHud, setZenPovHud] = useState(false);
  const [mobileHudExpanded, setMobileHudExpanded] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [isBinauralPlaying, setIsBinauralPlaying] = useState(() => binauralBeatsEngine.getStatus().isPlaying);
  const captureSceneRef = useRef<(() => string) | null>(null);

  // Load real FocusFlow tasks, bills, savings goals, categories, time-blocks, sessions, expenses, exams, study OS, whiteboard, doomscroll & capsules
  const [tasksData, setTasksData] = useState<Task[]>([]);
  const [billsData, setBillsData] = useState<Bill[]>([]);
  const [savingsGoalsData, setSavingsGoalsData] = useState<SavingsGoal[]>([]);
  const [categoriesData, setCategoriesData] = useState<ExpenseCategory[]>([]);
  const [timeBlocksData, setTimeBlocksData] = useState<TimeBlock[]>([]);
  const [sessionsData, setSessionsData] = useState<FocusSession[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseTransaction[]>([]);
  const [examsData, setExamsData] = useState<StudyExam[]>([]);
  const [subjectsData, setSubjectsData] = useState<StudySubject[]>([]);
  const [topicsData, setTopicsData] = useState<StudyTopic[]>([]);
  const [skillNodesData, setSkillNodesData] = useState<SkillNode[]>([]);
  const [latestWhiteboard, setLatestWhiteboard] = useState<{ dataUrl: string | null; title?: string }>({
    dataUrl: null,
  });
  const [doomscrollLogs, setDoomscrollLogs] = useState<DoomscrollTaxEntry[]>([]);
  const [timeCapsules, setTimeCapsules] = useState<TimeCapsuleLetter[]>([]);
  const [gamificationXP, setGamificationXP] = useState<number>(0);
  const [gamificationStreak, setGamificationStreak] = useState<number>(0);

  // Custom local preferences (Exam override, Season preview, Expansion preview)
  const [customExamOverride, setCustomExamOverride] = useState<{ title: string; examDate: string } | null>(() => {
    try {
      const raw = localStorage.getItem(`focusflow_home_exam_${activeUid}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [seasonOverride, setSeasonOverride] = useState<SeasonOverrideMode>(() => {
    try {
      const saved = localStorage.getItem(`focusflow_home_season_${activeUid}`);
      if (saved === 'monsoon' || saved === 'winter' || saved === 'spring_clear') return saved;
    } catch {
      // ignore
    }
    return 'auto';
  });
  const [apartmentTierOverride, setApartmentTierOverride] = useState<ApartmentTierOverride>(() => {
    try {
      const saved = localStorage.getItem(`focusflow_home_tier_${activeUid}`);
      if (saved === 'studio' || saved === 'balcony' || saved === 'penthouse') return saved;
    } catch {
      // ignore
    }
    return 'auto';
  });

  const routineState = useMemo(() => {
    if (activeMorningFrame) {
      return {
        zone: activeMorningFrame.zone,
        activity: activeMorningFrame.activity as StudyAvatarActivity,
        poseMode:
          activeMorningFrame.zone === 'study'
            ? ('seated' as const)
            : ('standing' as const),
        reason: activeMorningFrame.label,
        isSleeping: false,
        isStudying: activeMorningFrame.zone === 'study',
      };
    }
    if (hydrationCompletedRecently && !isRunning) {
      return {
        zone: 'kitchen' as HomeZoneId,
        activity: 'coffee' as StudyAvatarActivity,
        poseMode: 'standing' as const,
        reason: 'Hydration / Coffee Habit · Refreshed',
        isSleeping: false,
        isStudying: false,
      };
    }
    return deriveHomeRoutineState({
      isRunning,
      timerEngine,
      timerMode,
      currentHour: clockTick.hour,
      currentMinute: clockTick.minute,
      habitCompletedRecently,
      autoRoutine,
      manualZone,
      todayStr,
      timeBlocks: timeBlocksData,
    });
  }, [
    activeMorningFrame,
    hydrationCompletedRecently,
    isRunning,
    timerEngine,
    timerMode,
    clockTick.hour,
    clockTick.minute,
    habitCompletedRecently,
    autoRoutine,
    manualZone,
    todayStr,
    timeBlocksData,
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadHomeData = async () => {
      try {
        const [
          tasksRes,
          billsRes,
          goalsRes,
          catsRes,
          gamifRes,
          blocksRes,
          sessionsRes,
          expensesRes,
          examsRes,
          subjectsRes,
          topicsRes,
          wbRes,
          doomRes,
          capsRes,
          skillsRes,
        ] = await Promise.all([
          api.getTasks().catch(() => [] as Task[]),
          api.getBills().catch(() => [] as Bill[]),
          api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
          api.getCategories().catch(() => [] as ExpenseCategory[]),
          api.getGamificationProfile().catch(() => null),
          api.getTimeBlocks(todayStr).catch(() => [] as TimeBlock[]),
          api.getFocusSessions().catch(() => [] as FocusSession[]),
          api.getExpenses().catch(() => [] as ExpenseTransaction[]),
          api.getStudyExams().catch(() => [] as StudyExam[]),
          api.getStudySubjects().catch(() => [] as StudySubject[]),
          api.getStudyTopics().catch(() => [] as StudyTopic[]),
          api.getWhiteboardDrawings().catch(() => []),
          api.getDoomscrollLogs().catch(() => [] as DoomscrollTaxEntry[]),
          api.getTimeCapsules().catch(() => [] as TimeCapsuleLetter[]),
          api.getSkillNodes().catch(() => [] as SkillNode[]),
        ]);
        if (cancelled) return;
        setTasksData(Array.isArray(tasksRes) ? tasksRes : []);
        setBillsData(Array.isArray(billsRes) ? billsRes : []);
        setSavingsGoalsData(Array.isArray(goalsRes) ? goalsRes : []);
        setCategoriesData(Array.isArray(catsRes) ? catsRes : []);
        setTimeBlocksData(Array.isArray(blocksRes) ? blocksRes : []);
        setSessionsData(Array.isArray(sessionsRes) ? sessionsRes : []);
        setExpensesData(Array.isArray(expensesRes) ? expensesRes : []);
        setExamsData(Array.isArray(examsRes) ? examsRes : []);
        setSubjectsData(Array.isArray(subjectsRes) ? subjectsRes : []);
        setTopicsData(Array.isArray(topicsRes) ? topicsRes : []);
        setSkillNodesData(Array.isArray(skillsRes) ? skillsRes : []);

        // Latest Whiteboard drawing (cloud or local fallback)
        if (Array.isArray(wbRes) && wbRes.length > 0) {
          const sortedWb = [...wbRes].sort((a, b) =>
            (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
          );
          setLatestWhiteboard({ dataUrl: sortedWb[0].dataUrl || null, title: sortedWb[0].title });
        } else {
          try {
            const localWb = localStorage.getItem(`focusflow_${activeUid}_whiteboard_latest`);
            setLatestWhiteboard({
              dataUrl: localWb && localWb.startsWith('data:image/') ? localWb : null,
              title: 'Latest Sketch',
            });
          } catch {
            setLatestWhiteboard({ dataUrl: null });
          }
        }

        // Doomscroll logs (cloud or local fallback)
        if (Array.isArray(doomRes) && doomRes.length > 0) {
          setDoomscrollLogs(doomRes);
        } else {
          try {
            const localDoom = localStorage.getItem(`focusflow_${activeUid}_doomscroll_jar_v1`);
            setDoomscrollLogs(localDoom ? JSON.parse(localDoom) : []);
          } catch {
            setDoomscrollLogs([]);
          }
        }

        // Time capsules (cloud or local fallback)
        if (Array.isArray(capsRes) && capsRes.length > 0) {
          setTimeCapsules(capsRes);
        } else {
          try {
            const localCaps = localStorage.getItem(`focusflow_${activeUid}_time_capsules_v1`);
            setTimeCapsules(localCaps ? JSON.parse(localCaps) : []);
          } catch {
            setTimeCapsules([]);
          }
        }

        const realGamification = computeGamificationFromRealData({
          userId: activeUid,
          tasks: Array.isArray(tasksRes) ? tasksRes : [],
          focusSessions: Array.isArray(sessionsRes) ? sessionsRes : [],
          subjects: Array.isArray(subjectsRes) ? subjectsRes : [],
          topics: Array.isArray(topicsRes) ? topicsRes : [],
          studyPlanTasks: [],
          studyRevisions: [],
          habits: Array.isArray(habits) ? habits : [],
          bills: Array.isArray(billsRes) ? billsRes : [],
          savingsGoals: Array.isArray(goalsRes) ? goalsRes : [],
          leaderboardProfile: null,
          timezone: settings?.timezone,
        });
        const apiXP = Number(gamifRes?.profile?.totalXP || 0);
        setGamificationXP(Math.max(apiXP, realGamification.progress.totalXP));
        if (gamifRes?.profile) {
          setGamificationStreak(Number(gamifRes.profile.currentStreak || gamifRes.profile.longestStreak || 0));
        }
      } catch {
        // Keep safe defaults
      }
    };
    void loadHomeData();
    return () => {
      cancelled = true;
    };
  }, [activeUid, refreshKey, todayStr]);

  // Persistent pet species ('cat' | 'dog')
  const [petSpecies, setPetSpecies] = useState<PetSpecies>(() => {
    try {
      const saved = localStorage.getItem(`focusflow_home_pet_${activeUid}`);
      return saved === 'dog' ? 'dog' : 'cat';
    } catch {
      return 'cat';
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`focusflow_home_pet_${activeUid}`);
      setPetSpecies(saved === 'dog' ? 'dog' : 'cat');
    } catch {
      // ignore storage errors
    }
  }, [activeUid]);

  const handleSetPetSpecies = useCallback(
    (species: PetSpecies) => {
      setPetSpecies(species);
      try {
        localStorage.setItem(`focusflow_home_pet_${activeUid}`, species);
      } catch {
        // ignore storage errors
      }
    },
    [activeUid]
  );

  // Privacy-safe Visitor Mode State
  const [visitingTarget, setVisitingTarget] = useState<VisitorHomeTarget | null>(null);
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitorList, setVisitorList] = useState<VisitorHomeTarget[]>([]);
  const [activeShortcutModal, setActiveShortcutModal] = useState<
    | null
    | 'wall_schedule'
    | 'kitchen_dining'
    | 'upgrades'
    | 'end_day'
    | 'exam_season'
    | 'parcel_mail'
    | 'doomscroll_jar'
    | 'time_capsule'
    | 'shop'
    | 'custom_frames'
    | 'arcade'
    | 'paper_plane'
    | 'dream_globe'
  >(null);

  const [isStandingDesk, setIsStandingDesk] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`focusflow_home_stand_desk_${activeUid}`) === '1';
    } catch {
      return false;
    }
  });
  const [arcadeHighScore, setArcadeHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(`focusflow_home_arcade_hs_${activeUid}`) || '0') || 0;
    } catch {
      return 0;
    }
  });
  const [dreamCity, setDreamCity] = useState<DreamGlobeDestination>(() => {
    try {
      const savedId = localStorage.getItem(`focusflow_home_dream_city_${activeUid}`);
      const match = DREAM_GLOBE_CITIES.find((c) => c.id === savedId);
      if (match) return match;
    } catch {
      // ignore
    }
    return DREAM_GLOBE_CITIES[0];
  });
  const [paperMessages, setPaperMessages] = useState<PaperAirplaneMessage[]>(() => {
    try {
      const raw = localStorage.getItem(`focusflow_home_paper_notes_${activeUid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as PaperAirplaneMessage[];
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome-plane-1',
        senderName: 'Study Squad',
        sourceLabel: 'Squad Note',
        message: 'Keep up the streak! One focused Pomodoro at a time.',
        createdAt: new Date().toISOString(),
        read: false,
      },
    ];
  });

  const [coinDropSeq, setCoinDropSeq] = useState(0);
  const [customFrames, setCustomFrames] = useState<CustomWallFrameConfig[]>(() => {
    try {
      const raw = localStorage.getItem(`focusflow_home_frames_${activeUid}`);
      if (raw) return JSON.parse(raw) as CustomWallFrameConfig[];
    } catch {
      // ignore
    }
    return DEFAULT_CUSTOM_FRAMES;
  });

  // Click-to-Walk floor destination
  const [walkTarget, setWalkTarget] = useState<{ pos: [number, number, number]; seq: number } | null>(null);

  // 3D Furniture Shop & 0.5m Grid Layout Editor
  const [shopState, setShopState] = useState<HomeShopState>(() => {
    try {
      const raw = localStorage.getItem(`focusflow_home_shop_${activeUid}`);
      if (raw) return JSON.parse(raw) as HomeShopState;
    } catch {
      // ignore
    }
    return DEFAULT_HOME_SHOP_STATE;
  });

  // Cross-device Firestore sync for My Home customizations via settings.myHomeState
  const hydratedHomeCloudRef = useRef<string | null>(null);
  useEffect(() => {
    const cloud = settings?.myHomeState;
    if (!cloud || hydratedHomeCloudRef.current === activeUid) return;
    hydratedHomeCloudRef.current = activeUid;
    if (cloud.petSpecies === 'cat' || cloud.petSpecies === 'dog') setPetSpecies(cloud.petSpecies);
    if (isKnownHomeRoomStyle(cloud.roomStyle)) {
      setRoomStyle(cloud.roomStyle);
      try {
        localStorage.setItem(`focusflow_home_room_style_${activeUid}`, cloud.roomStyle);
      } catch {}
    }
    if (
      cloud.apartmentTierOverride === 'auto' ||
      cloud.apartmentTierOverride === 'studio' ||
      cloud.apartmentTierOverride === 'balcony' ||
      cloud.apartmentTierOverride === 'penthouse'
    ) {
      setApartmentTierOverride(cloud.apartmentTierOverride);
    }
    if (cloud.shopState && Array.isArray(cloud.shopState.ownedIds)) {
      setShopState(cloud.shopState as HomeShopState);
    }
    if (Array.isArray(cloud.customFrames) && cloud.customFrames.length > 0) {
      setCustomFrames(cloud.customFrames as unknown as CustomWallFrameConfig[]);
    }
    if (cloud.dreamCityId) {
      const city = DREAM_GLOBE_CITIES.find((c) => c.id === cloud.dreamCityId);
      if (city) setDreamCity(city);
    }
    if (typeof cloud.arcadeHighScore === 'number') setArcadeHighScore(cloud.arcadeHighScore);
    if (typeof cloud.isStandingDesk === 'boolean') setIsStandingDesk(cloud.isStandingDesk);
    if (Array.isArray(cloud.paperMessages) && cloud.paperMessages.length > 0) {
      setPaperMessages(cloud.paperMessages as PaperAirplaneMessage[]);
    }
  }, [activeUid, settings?.myHomeState]);

  const homeCloudSyncInitializedRef = useRef(false);
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    if (!homeCloudSyncInitializedRef.current) {
      homeCloudSyncInitializedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void updateSettings(
        {
          myHomeState: {
            roomStyle,
            petSpecies,
            apartmentTierOverride,
            shopState,
            customFrames: customFrames as unknown as Array<{
              id: string;
              preset?: string;
              title?: string;
              imageDataUrl?: string | null;
              [key: string]: unknown;
            }>,
            dreamCityId: dreamCity.id,
            arcadeHighScore,
            isStandingDesk,
            paperMessages: paperMessages.slice(0, 12),
            updatedAt: Date.now(),
          },
        },
        { silent: true, skipRefresh: true }
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    firebaseUser?.uid,
    roomStyle,
    petSpecies,
    apartmentTierOverride,
    shopState,
    customFrames,
    dreamCity.id,
    arcadeHighScore,
    isStandingDesk,
    paperMessages,
    updateSettings,
  ]);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [selectedShopItemId, setSelectedShopItemId] = useState<ShopItemId | null>(null);

  // Break Micro-Actions: Pet/Feed reaction & 1-min Breathing Orb
  const [petReactionCue, setPetReactionCue] = useState<{ type: 'pet' | 'feed'; seq: number } | null>(null);
  const [breathingSecondsLeft, setBreathingSecondsLeft] = useState(0);
  useEffect(() => {
    if (breathingSecondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setBreathingSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [breathingSecondsLeft > 0]);

  // Co-Study Squad Guests (up to 3 live members)
  const [showCoStudyGuests, setShowCoStudyGuests] = useState(false);
  const [coStudyGuests, setCoStudyGuests] = useState<VisitorHomeTarget[]>([]);
  const [guestEmoteEvent, setGuestEmoteEvent] = useState<AvatarEmoteEvent | null>(null);

  const isVisiting = Boolean(visitingTarget);

  const handleSelectZone = useCallback(
    (zone: HomeZoneId) => {
      if (visitingTarget) {
        showToast?.(
          `Viewing ${visitingTarget.displayName}'s home (Read-Only). Return home to move your avatar.`,
          'info'
        );
        return;
      }
      setAutoRoutine(false);
      setManualZone(zone);
    },
    [visitingTarget, showToast]
  );

  const openVisitHomeModal = useCallback(async () => {
    setVisitModalOpen(true);
    setVisitLoading(true);
    try {
      const byUid = new Map<string, VisitorHomeTarget>();

      // 1. Firebase Study Squad members (public profile data only)
      let publicProfileByUid = new Map<string, Awaited<ReturnType<typeof fetchSquadMemberProfiles>>[number]>();
      if (firebaseUser?.uid) {
        try {
          const squads = await listUserSquads(firebaseUser.uid);
          const allMemberUids = Array.from(
            new Set(squads.flatMap((sq) => sq.memberUids || []).filter((id) => id && id !== activeUid))
          );
          if (allMemberUids.length > 0) {
            const profiles = await fetchSquadMemberProfiles(allMemberUids);
            publicProfileByUid = new Map(profiles.map((p) => [p.uid, p]));
            for (const sq of squads) {
              for (const uid of sq.memberUids || []) {
                if (!uid || uid === activeUid || byUid.has(uid)) continue;
                const prof = publicProfileByUid.get(uid);
                if (!prof) continue;
                byUid.set(
                  uid,
                  buildVisitorHomeFromLeaderboardProfile(prof, {
                    source: 'squad',
                    sourceLabel: `Squad · ${sq.name}`,
                    isStudyingLive: isProfileStudyingLive(prof),
                  })
                );
              }
            }
          }
        } catch {
          // ignore squad fetch failure
        }
      }

      // 2. Joint Vault partners — strictly read ONLY member.uid & member.name, NEVER vault amounts
      try {
        const vaults = await api.getJointVaults();
        const partnerEntries: Array<{ uid: string; name: string; vaultName: string }> = [];
        for (const summary of vaults || []) {
          const vaultName = summary?.vault?.name || 'Joint Vault';
          for (const m of summary?.members || []) {
            if (!m || m.status !== 'active' || !m.uid || m.uid === activeUid) continue;
            partnerEntries.push({ uid: m.uid, name: m.name || 'Partner', vaultName });
          }
        }
        const missingProfileUids = partnerEntries
          .map((p) => p.uid)
          .filter((uid) => !publicProfileByUid.has(uid));
        if (firebaseUser?.uid && missingProfileUids.length > 0) {
          const fetched = await fetchSquadMemberProfiles(Array.from(new Set(missingProfileUids))).catch(() => []);
          for (const prof of fetched) {
            publicProfileByUid.set(prof.uid, prof);
          }
        }
        for (const p of partnerEntries) {
          if (byUid.has(p.uid)) continue;
          const pub = publicProfileByUid.get(p.uid) || null;
          byUid.set(
            p.uid,
            buildVisitorHomeFromVaultPartner({
              uid: p.uid,
              name: p.name,
              vaultName: p.vaultName,
              publicProfile: pub,
              isStudyingLive: pub ? isProfileStudyingLive(pub) : false,
            })
          );
        }
      } catch {
        // ignore vaults fetch failure
      }

      // 3. Accepted local/social friends fallback
      if (byUid.size === 0) {
        try {
          const social = await api.getSocialOverview();
          const friends = social?.friends?.friends || [];
          for (const f of friends) {
            if (!f?.userId || f.userId === activeUid || byUid.has(f.userId)) continue;
            byUid.set(f.userId, {
              uid: f.userId,
              displayName: f.displayName || 'Study Friend',
              source: 'friend',
              sourceLabel: 'Study Friend',
              streakDays: Number(f.currentStreak || 0),
              estimatedXP: Number(f.totalXP || 0),
              isStudyingLive: Boolean(f.isOnline),
              studyActivity: f.isOnline ? 'studying' : 'coffee',
              petSpecies: Number(f.currentStreak || 0) >= 7 ? 'dog' : 'cat',
            });
          }
        } catch {
          // ignore fallback error
        }
      }

      setVisitorList(Array.from(byUid.values()));
    } finally {
      setVisitLoading(false);
    }
  }, [activeUid, firebaseUser?.uid]);

  const habitSummary = useMemo(() => summarizeTodayHabits(habits, todayStr), [habits, todayStr]);

  const ownCleanliness = useMemo(
    () =>
      computeRoomCleanliness({
        tasks: tasksData,
        bills: billsData,
        todayStr,
      }),
    [tasksData, billsData, todayStr]
  );

  // Privacy boundary: when visiting someone else's home, personal tasks/bills/finances NEVER appear
  const effectiveCleanliness = useMemo(
    () =>
      isVisiting
        ? {
            overdueTasksCount: 0,
            dueTodayTasksCount: 0,
            unpaidBillsCount: 0,
            overdueBillsCount: 0,
            clutterLevel: 0 as const,
            lampDimFactor: 1,
            isNeatAndBright: true,
            actionableTasks: [],
            actionableBills: [],
          }
        : ownCleanliness,
    [isVisiting, ownCleanliness]
  );

  const effectiveStreakDays = visitingTarget
    ? visitingTarget.streakDays
    : Math.max(gamificationStreak, habitSummary.bestHabitStreak);

  const effectiveUnlocksSummary = useMemo(
    () =>
      computeHomeUnlocks({
        totalXP: visitingTarget ? visitingTarget.estimatedXP : gamificationXP,
        savingsGoals: visitingTarget ? [] : savingsGoalsData,
        streakDays: effectiveStreakDays,
      }),
    [visitingTarget, gamificationXP, savingsGoalsData, effectiveStreakDays]
  );

  const currentLevel = effectiveUnlocksSummary.level;

  const effectiveRoomStyle: HomeRoomStyle = useMemo(() => {
    if (isVisiting) return 'classic';
    const chosen = getHomeRoomTheme(roomStyle);
    if (currentLevel >= chosen.unlockLevel) return chosen.id;
    return 'classic';
  }, [isVisiting, roomStyle, currentLevel]);

  const handleChangeRoomStyle = useCallback(
    (next: HomeRoomStyle) => {
      if (isVisiting) return;
      const target = getHomeRoomTheme(next);
      if (currentLevel < target.unlockLevel) {
        showToast?.(
          `🔒 Reach Level ${target.unlockLevel} to unlock ${target.label}! (Currently Lv ${currentLevel})`,
          'info'
        );
        return;
      }
      setRoomStyle(target.id);
      try {
        localStorage.setItem(`focusflow_home_room_style_${activeUid}`, target.id);
      } catch {
        // ignore
      }
      showToast?.(target.toastMessage, 'info');
    },
    [activeUid, currentLevel, isVisiting, showToast]
  );

  const effectiveRoutineState = useMemo(() => {
    if (!visitingTarget) return routineState;
    return visitingTarget.isStudyingLive
      ? {
          zone: 'study' as HomeZoneId,
          activity: visitingTarget.studyActivity,
          poseMode: 'seated' as const,
          isSleeping: false,
          isStudying: true,
          reason: visitingTarget.activeSubject
            ? `Live Studying · ${visitingTarget.activeSubject}`
            : `${visitingTarget.displayName} is focusing now`,
          isOutOfRoom: false,
          outReason: undefined,
          activeBlockTitle: visitingTarget.activeSubject,
        }
      : {
          zone: 'dining' as HomeZoneId,
          activity: 'coffee' as const,
          poseMode: 'seated' as const,
          isSleeping: false,
          isStudying: false,
          reason: `${visitingTarget.displayName} is taking a breather`,
          isOutOfRoom: false,
          outReason: undefined,
          activeBlockTitle: undefined,
        };
  }, [visitingTarget, routineState]);

  const effectiveAvatarIdentity = useMemo(() => {
    if (!visitingTarget) return avatarIdentity;
    return resolveStudyAvatarIdentity({
      uid: visitingTarget.uid,
      displayName: visitingTarget.displayName,
      avatarColor: '#0ea5e9',
      avatarConfig: visitingTarget.avatarConfig ?? null,
    });
  }, [visitingTarget, avatarIdentity]);

  const effectiveIsStaticUnrigged = useMemo(() => {
    const entry = getAvatarCatalogEntry(effectiveAvatarIdentity.id);
    return !entry.hasHumanoidSkeleton;
  }, [effectiveAvatarIdentity.id]);

  // Batch 2-4 Personal OS Computations (strictly hidden/neutralized in Visit Home mode)
  const corkboardTasks = useMemo(
    () => (isVisiting ? [] : selectCorkboardTasks(tasksData, todayStr, 4)),
    [isVisiting, tasksData, todayStr]
  );

  const dailyWrapUpStats = useMemo(
    () =>
      computeDailyWrapUpStats({
        sessions: sessionsData,
        expenses: expensesData,
        habits,
        tasks: tasksData,
        todayStr,
        timezone: userTimezone,
      }),
    [sessionsData, expensesData, habits, tasksData, todayStr, userTimezone]
  );

  const examSummary = useMemo(
    () =>
      computeExamAndTargetSummary({
        exams: isVisiting ? [] : examsData,
        todayStr,
        todayFocusMinutes: isVisiting ? 0 : dailyWrapUpStats.focusMinutesToday,
        dailyGoalMinutes: settings?.dailyFocusGoalMinutes || 120,
        customExamOverride: isVisiting ? null : customExamOverride,
      }),
    [
      isVisiting,
      examsData,
      todayStr,
      dailyWrapUpStats.focusMinutesToday,
      settings?.dailyFocusGoalMinutes,
      customExamOverride,
    ]
  );

  const seasonState = useMemo(
    () =>
      computeCalendarSeasonState({
        todayStr,
        birthDate: isVisiting ? null : settings?.birthDate,
        isExamWeek: examSummary.isExamWeek,
        seasonOverride: isVisiting ? 'auto' : seasonOverride,
      }),
    [todayStr, isVisiting, settings?.birthDate, examSummary.isExamWeek, seasonOverride]
  );

  const plantState = useMemo(
    () =>
      isVisiting
        ? {
            stage: (effectiveStreakDays >= 30
              ? 'blooming'
              : effectiveStreakDays >= 7
                ? 'leafy'
                : 'sprout') as LivingPlantStage,
            streakDays: effectiveStreakDays,
            daysSinceLastHabit: 0,
            label: `${effectiveStreakDays}d Streak Plants`,
          }
        : computeLivingPlantState({
            streakDays: effectiveStreakDays,
            habits,
            todayStr,
          }),
    [isVisiting, effectiveStreakDays, habits, todayStr]
  );

  const vaultSafe = useMemo(
    () => computeVaultSafeState(isVisiting ? 0 : effectiveUnlocksSummary.bestSavingsPct),
    [isVisiting, effectiveUnlocksSummary.bestSavingsPct]
  );

  const deliveries = useMemo(
    () =>
      isVisiting
        ? {
            hasParcel: false,
            hasMail: false,
            parcelCount: 0,
            mailCount: 0,
            recentShoppingParcels: [],
            upcomingBills: [],
          }
        : computeDoorstepDeliveries({
            expenses: expensesData,
            bills: billsData,
            todayStr,
          }),
    [isVisiting, expensesData, billsData, todayStr]
  );

  const flowStateSummary = useMemo(
    () =>
      isVisiting
        ? {
            isFlowStateActive: false,
            elapsedUninterruptedMinutes: 0,
            completedWorkCyclesToday: 0,
            hasFourCycleLantern: false,
          }
        : computeFlowStateStatus({
            isRunning,
            timerMode,
            timerEngine,
            totalDuration,
            timeLeft,
            stopwatchElapsed,
            wasPausedThisRun,
            sessions: sessionsData,
            todayStr,
            timezone: userTimezone,
          }),
    [
      isVisiting,
      isRunning,
      timerMode,
      timerEngine,
      totalDuration,
      timeLeft,
      stopwatchElapsed,
      wasPausedThisRun,
      sessionsData,
      todayStr,
      userTimezone,
    ]
  );

  const doomscrollJarState = useMemo(
    () =>
      isVisiting
        ? { totalTaxAmount: 0, totalMinutes: 0, entryCount: 0, coinCount: 0, isEmpty: true }
        : computeDoomscrollJarState(doomscrollLogs),
    [isVisiting, doomscrollLogs]
  );

  const bookshelfState = useMemo(
    () =>
      computeLivingBookshelfState({
        subjects: isVisiting ? [] : subjectsData,
        topics: isVisiting ? [] : topicsData,
      }),
    [isVisiting, subjectsData, topicsData]
  );

  const timeCapsuleChestState = useMemo(
    () =>
      isVisiting
        ? {
            totalCount: 0,
            readyCount: 0,
            lockedCount: 0,
            openedCount: 0,
            shouldGlow: false,
            readyCapsules: [],
            lockedCapsules: [],
          }
        : computeTimeCapsuleChestState({ capsules: timeCapsules, todayStr }),
    [isVisiting, timeCapsules, todayStr]
  );

  const hydrationState = useMemo(
    () =>
      isVisiting
        ? { hasHydrationHabit: false, hydratedToday: true, waterFillRatio: 0.78 }
        : computeHydrationHabitState({ habits, todayStr }),
    [isVisiting, habits, todayStr]
  );

  const apartmentExpansion = useMemo(
    () =>
      computeApartmentExpansion({
        level: effectiveUnlocksSummary.level,
        override: isVisiting ? 'auto' : apartmentTierOverride,
      }),
    [effectiveUnlocksSummary.level, isVisiting, apartmentTierOverride]
  );

  const availableCoins = useMemo(
    () =>
      computeFocusCoinsBalance({
        totalXP: gamificationXP,
        completedWorkCyclesToday: flowStateSummary.completedWorkCyclesToday,
        spentCoins: shopState.spentCoins,
      }),
    [gamificationXP, flowStateSummary.completedWorkCyclesToday, shopState.spentCoins]
  );

  const skyState = useMemo(
    () => computeSunMoonSkyPosition(clockTick.hour, clockTick.minute, lighting === 'night'),
    [clockTick.hour, clockTick.minute, lighting]
  );

  const smartTvData = useMemo(
    () => ({
      todayFocusMinutes: isVisiting ? 0 : dailyWrapUpStats.focusMinutesToday,
      dailyGoalMinutes: settings?.dailyFocusGoalMinutes || 120,
      budgetSummary: computeMonthlyBudgetSummary({
        expenses: isVisiting ? [] : expensesData,
        monthlyBudgetPaise: settings?.monthlyBudgetPaise,
        todayStr,
      }),
      heatmap: computeStreakHeatmapDays({
        sessions: isVisiting ? [] : sessionsData,
        habits: isVisiting ? [] : habits,
        todayStr,
        timezone: userTimezone,
      }),
      streakDays: effectiveStreakDays,
    }),
    [
      isVisiting,
      dailyWrapUpStats.focusMinutesToday,
      settings?.dailyFocusGoalMinutes,
      settings?.monthlyBudgetPaise,
      expensesData,
      todayStr,
      sessionsData,
      habits,
      userTimezone,
      effectiveStreakDays,
    ]
  );

  const showFireworks =
    effectiveStreakDays >= 7 ||
    effectiveUnlocksSummary.bestSavingsPct >= 100 ||
    flowStateSummary.hasFourCycleLantern;

  const focusAquarium = useMemo(
    () =>
      computeFocusAquariumState({
        sessions: isVisiting ? [] : sessionsData,
        streakDays: effectiveStreakDays,
        todayStr,
        timezone: userTimezone,
      }),
    [isVisiting, sessionsData, effectiveStreakDays, todayStr, userTimezone]
  );

  const constellationStars = useMemo(
    () =>
      computeConstellationStars({
        subjects: isVisiting ? [] : subjectsData,
        topics: isVisiting ? [] : topicsData,
        skillNodes: isVisiting ? [] : skillNodesData,
      }),
    [isVisiting, subjectsData, topicsData, skillNodesData]
  );

  const totalSavedPaise = useMemo(
    () =>
      isVisiting
        ? 0
        : savingsGoalsData.reduce((acc, g) => acc + Math.max(0, Number(g.savedPaise || 0)), 0),
    [isVisiting, savingsGoalsData]
  );

  const vinylSleeves = useMemo(
    () => computeVinylRecordRack(isVisiting ? 0 : sessionsData.filter((s) => s.completed !== false).length),
    [isVisiting, sessionsData]
  );

  const weatherOrbState = useMemo(
    () =>
      computeMomentumWeatherOrbState({
        todayFocusMinutes: examSummary.todayFocusMinutes,
        isFlowStateActive: flowStateSummary.isFlowStateActive,
        isRunning: isVisiting ? Boolean(visitingTarget?.isStudyingLive) : isRunning,
      }),
    [examSummary.todayFocusMinutes, flowStateSummary.isFlowStateActive, isVisiting, visitingTarget?.isStudyingLive, isRunning]
  );

  const dreamGlobeProgress = useMemo(
    () => computeDreamGlobeProgress(effectiveUnlocksSummary.bestSavingsPct),
    [effectiveUnlocksSummary.bestSavingsPct]
  );

  const paperAirplaneState = useMemo(() => {
    if (isVisiting) return { unreadCount: 0, latestMessage: null };
    const unread = paperMessages.filter((m) => !m.read);
    return {
      unreadCount: unread.length,
      latestMessage: unread[0] || paperMessages[0] || null,
    };
  }, [isVisiting, paperMessages]);

  const formatTimerClock = (totalSec: number) => {
    const mins = Math.floor(Math.max(0, totalSec) / 60);
    const secs = Math.max(0, totalSec) % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const laptopScreenState = useMemo(() => {
    if (isVisiting) {
      return {
        timerLabel: visitingTarget?.isStudyingLive ? 'LIVE' : 'CHILL',
        modeLabel: visitingTarget?.displayName?.slice(0, 12) || 'PARTNER',
        isRunning: Boolean(visitingTarget?.isStudyingLive),
        progressRatio: visitingTarget?.isStudyingLive ? 0.65 : 0.25,
        subtitle: visitingTarget?.activeSubject || 'Shared Room',
      };
    }
    const label =
      timerEngine === 'stopwatch' ? formatTimerClock(stopwatchElapsed) : formatTimerClock(timeLeft);
    const ratio =
      timerEngine === 'stopwatch'
        ? Math.min(1, stopwatchElapsed / 3600)
        : totalDuration > 0
          ? 1 - timeLeft / totalDuration
          : 0;
    const modeLabel =
      timerMode === 'short_break' || timerEngine === 'short_break'
        ? 'BREAK'
        : timerMode === 'long_break' || timerEngine === 'long_break'
          ? 'LONG BRK'
          : isRunning
            ? 'FOCUS'
            : 'READY';
    return {
      timerLabel: label,
      modeLabel,
      isRunning,
      progressRatio: Math.max(0, Math.min(1, ratio)),
      subtitle: effectiveRoutineState.activeBlockTitle || effectiveRoutineState.reason,
    };
  }, [
    isVisiting,
    visitingTarget,
    timerEngine,
    stopwatchElapsed,
    timeLeft,
    totalDuration,
    timerMode,
    isRunning,
    effectiveRoutineState,
  ]);

  // Sims-Style Needs Bars (Energy, Focus, Mood) updated deterministically every 1s
  const needsContext = useMemo(
    () => ({
      isRunning,
      timerMode,
      timerEngine,
      activeZone: routineState.zone,
      activity: routineState.activity,
      isWalking,
      completedHabitsToday: habitSummary.completedHabitsToday,
      totalActiveHabits: habitSummary.totalActiveHabits,
      streakDays: effectiveStreakDays,
      clutterLevel: ownCleanliness.clutterLevel,
      currentHour: clockTick.hour,
    }),
    [
      isRunning,
      timerMode,
      timerEngine,
      routineState.zone,
      routineState.activity,
      isWalking,
      habitSummary.completedHabitsToday,
      habitSummary.totalActiveHabits,
      effectiveStreakDays,
      ownCleanliness.clutterLevel,
      clockTick.hour,
    ]
  );

  const [needs, setNeeds] = useState<SimsNeedsState>(() => computeInitialSimsNeeds(needsContext));
  const needsCtxRef = useRef(needsContext);
  needsCtxRef.current = needsContext;

  useEffect(() => {
    const id = window.setInterval(() => {
      setNeeds((prev) => stepSimsNeeds(prev, needsCtxRef.current, 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleTogglePetSpecies = useCallback(() => {
    if (visitingTarget) {
      showToast?.(`You're visiting ${visitingTarget.displayName}'s companion (Read-Only).`, 'info');
      return;
    }
    const next: PetSpecies = petSpecies === 'cat' ? 'dog' : 'cat';
    handleSetPetSpecies(next);
    showToast?.(
      next === 'cat' ? '🐈 Switched pet companion to Mochi (Cat)' : '🐕 Switched pet companion to Kibo (Shiba)',
      'success'
    );
  }, [visitingTarget, petSpecies, handleSetPetSpecies, showToast]);

  const handleClickFurniture = useCallback(
    (shortcut: FurnitureShortcutId) => {
      if (visitingTarget) {
        showToast?.(
          `Viewing ${visitingTarget.displayName}'s home (Read-Only). Return home to use shortcuts.`,
          'info'
        );
        return;
      }

      if (shortcut === 'laptop') {
        if (isRunning) {
          pauseTimer();
          showToast?.('Focus timer paused from Study Laptop', 'info');
        } else {
          if (timerMode !== 'work') {
            switchTimerMode('work');
          }
          startTimer();
          showToast?.('Focus session started from Study Desk!', 'success');
        }
        return;
      }

      if (shortcut === 'bookshelf') {
        showToast?.('Opening Study OS & Syllabus...', 'info');
        setCurrentTab('study');
        return;
      }

      if (shortcut === 'kitchen_dining') {
        setActiveShortcutModal('kitchen_dining');
        return;
      }

      if (shortcut === 'wall_schedule') {
        setActiveShortcutModal('wall_schedule');
        return;
      }

      if (shortcut === 'window_speaker') {
        const order: AmbientPreset[] = ['rain', 'cafe', 'drone', 'off'];
        const currIdx = order.indexOf(ambientPreset);
        const nextPreset = order[(currIdx + 1) % order.length];
        void setAmbientSound(nextPreset, ambientVolume);
        const labels: Record<AmbientPreset, string> = {
          rain: '🌧️ Rain ambience ON (look outside the window!)',
          cafe: '☕ Cozy Cafe chatter ON',
          drone: '🎧 Lo-Fi Focus drone ON',
          ocean: '🌊 Ocean waves ON',
          off: '🔇 Ambient audio muted',
        };
        showToast?.(labels[nextPreset], 'info');
        return;
      }

      if (shortcut === 'bed') {
        setActiveShortcutModal('end_day');
        return;
      }

      if (shortcut === 'exam_frame') {
        setActiveShortcutModal('exam_season');
        return;
      }

      if (shortcut === 'vault_safe') {
        showToast?.(`🏦 ${vaultSafe.label} — Opening Savings Goals`, 'info');
        setCurrentTab('envelopes');
        return;
      }

      if (shortcut === 'parcel_mail') {
        setActiveShortcutModal('parcel_mail');
        return;
      }

      if (shortcut === 'mini_whiteboard') {
        try {
          sessionStorage.setItem('focusflow_study_initial_subtab', 'whiteboard');
        } catch {
          // ignore
        }
        showToast?.('✏️ Opening Rough Whiteboard Sketch Pad...', 'info');
        setCurrentTab('study');
        return;
      }

      if (shortcut === 'doomscroll_jar') {
        setActiveShortcutModal('doomscroll_jar');
        return;
      }

      if (shortcut === 'time_capsule') {
        setActiveShortcutModal('time_capsule');
        return;
      }

      if (shortcut === 'vinyl_player') {
        if (binauralBeatsEngine.getStatus().isPlaying) {
          binauralBeatsEngine.stop();
          setIsBinauralPlaying(false);
          showToast?.('🎵 Vinyl Turntable & Binaural Beats paused', 'info');
        } else {
          binauralBeatsEngine.start(BINAURAL_PRESETS[0], 0.3);
          setIsBinauralPlaying(true);
          showToast?.('🎵 Vinyl Spinning — Alpha Flow Binaural Beats ON!', 'success');
        }
        return;
      }

      if (shortcut === 'hydration_bottle') {
        setHydrationCompletedRecently(true);
        setTimeout(() => setHydrationCompletedRecently(false), 12_000);
        setAutoRoutine(false);
        setManualZone('kitchen');
        showToast?.('💧 Drinking water in kitchen — staying hydrated!', 'success');
        return;
      }

      if (shortcut === 'balcony_chair') {
        setAutoRoutine(false);
        setManualZone('dining');
        showToast?.('🌃 Taking a balcony skyline breather!', 'info');
        return;
      }

      if (shortcut === 'smart_tv') {
        showToast?.('📺 Opening Analytics & Reports...', 'info');
        setCurrentTab('analytics');
        return;
      }

      if (shortcut === 'custom_frame_1' || shortcut === 'custom_frame_2') {
        setActiveShortcutModal('custom_frames');
        return;
      }

      if (shortcut === 'observatory') {
        setCameraPreset('observatory');
        showToast?.('🔭 Zooming into Skill & Study Constellation Observatory!', 'info');
        return;
      }

      if (shortcut === 'standing_desk_switch') {
        setIsStandingDesk((prev) => {
          const next = !prev;
          try {
            localStorage.setItem(`focusflow_home_stand_desk_${activeUid}`, next ? '1' : '0');
          } catch {
            // ignore
          }
          showToast?.(
            next
              ? '🧍 Motorized Desk raised to Standing Mode!'
              : '🪑 Motorized Desk lowered to Sitting Mode',
            'success'
          );
          return next;
        });
        return;
      }

      if (shortcut === 'arcade_cabinet') {
        if (examSummary.dailyTargetPct < 100) {
          showToast?.(
            `🕹️ Retro Arcade unlocks at 100% daily focus goal (${Math.round(examSummary.dailyTargetPct)}% done)!`,
            'info'
          );
          return;
        }
        setActiveShortcutModal('arcade');
        return;
      }

      if (shortcut === 'paper_airplane') {
        setActiveShortcutModal('paper_plane');
        return;
      }

      if (shortcut === 'dream_globe') {
        setActiveShortcutModal('dream_globe');
      }
    },
    [
      visitingTarget,
      isRunning,
      pauseTimer,
      timerMode,
      switchTimerMode,
      startTimer,
      setCurrentTab,
      ambientPreset,
      ambientVolume,
      setAmbientSound,
      vaultSafe.label,
      activeUid,
      examSummary.dailyTargetPct,
      showToast,
    ]
  );

  const handleSelectVinylSleeve = useCallback(
    (sleeve: VinylRecordSleeve) => {
      if (visitingTarget) return;
      if (!sleeve.unlocked) {
        showToast?.(`💿 Unlocks after ${sleeve.requiredSessions} completed focus sessions!`, 'info');
        return;
      }
      void setAmbientSound(sleeve.ambientPreset, ambientVolume);
      if (sleeve.useBinaural || !binauralBeatsEngine.getStatus().isPlaying) {
        binauralBeatsEngine.start(BINAURAL_PRESETS[0], 0.25);
        setIsBinauralPlaying(true);
      }
      showToast?.(`💿 Now spinning: ${sleeve.title}`, 'success');
    },
    [visitingTarget, setAmbientSound, ambientVolume, showToast]
  );

  const handleCompleteCorkboardTask = useCallback(
    async (taskId: string) => {
      if (isVisiting) return;
      try {
        await api.updateTask(taskId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
        setTasksData((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t
          )
        );
        triggerRefresh();
        showToast?.('✓ Task completed directly from your 3D Corkboard!', 'success');
      } catch {
        showToast?.('Could not mark task completed right now.', 'error');
      }
    },
    [isVisiting, triggerRefresh, showToast]
  );

  const handleConfirmEndDaySleep = useCallback(() => {
    if (isRunning) pauseTimer();
    setLighting('night');
    setAutoRoutine(false);
    setManualZone('bedroom');
    showToast?.('🌙 End Day confirmed — resting in dim moonlight mode. Good night!', 'success');
  }, [isRunning, pauseTimer, showToast]);

  const handleSaveCustomExam = useCallback(
    (title: string, examDate: string) => {
      const next = { title: title.trim() || 'Target Exam', examDate };
      setCustomExamOverride(next);
      try {
        localStorage.setItem(`focusflow_home_exam_${activeUid}`, JSON.stringify(next));
      } catch {
        // ignore
      }
      showToast?.(`Updated Exam Countdown frame: ${next.title}`, 'success');
    },
    [activeUid, showToast]
  );

  const handleSaveBirthDate = useCallback(
    async (birthDate: string) => {
      await updateSettings({ birthDate }, { silent: true });
      triggerRefresh();
      showToast?.('🎂 Birthday saved for Dining Table celebration!', 'success');
    },
    [updateSettings, triggerRefresh, showToast]
  );

  const handleChangeSeasonOverride = useCallback(
    (mode: SeasonOverrideMode) => {
      setSeasonOverride(mode);
      try {
        localStorage.setItem(`focusflow_home_season_${activeUid}`, mode);
      } catch {
        // ignore
      }
    },
    [activeUid]
  );

  const handleChangeApartmentTierOverride = useCallback(
    (tier: ApartmentTierOverride) => {
      setApartmentTierOverride(tier);
      try {
        localStorage.setItem(`focusflow_home_tier_${activeUid}`, tier);
      } catch {
        // ignore
      }
    },
    [activeUid]
  );

  const handleSweepDoomscrollJarToGoal = useCallback(async () => {
    try {
      const topGoal = savingsGoalsData[0];
      if (topGoal && doomscrollJarState.totalTaxAmount > 0) {
        const addedPaise = Math.round(doomscrollJarState.totalTaxAmount * 100);
        await api.updateSavingsGoal(topGoal.id, {
          savedPaise: (topGoal.savedPaise || 0) + addedPaise,
        });
      }
      await api.clearDoomscrollLogs();
      try {
        localStorage.removeItem(`focusflow_${activeUid}_doomscroll_jar_v1`);
      } catch {
        // ignore
      }
      setDoomscrollLogs([]);
      triggerRefresh();
      showToast?.('✨ Doomscroll Tax Jar swept cleanly & jar emptied!', 'success');
    } catch {
      showToast?.('Could not sweep jar right now.', 'error');
    }
  }, [savingsGoalsData, doomscrollJarState.totalTaxAmount, activeUid, triggerRefresh, showToast]);

  const handleUnsealTimeCapsule = useCallback(
    async (capsuleId: string) => {
      const cap = timeCapsules.find((c) => c.id === capsuleId);
      if (!cap) return;
      const opened: TimeCapsuleLetter = {
        ...cap,
        isUnlocked: true,
        openedAt: new Date().toISOString(),
      };
      await api.saveTimeCapsule(opened);
      setTimeCapsules((prev) => prev.map((c) => (c.id === capsuleId ? opened : c)));
      triggerRefresh();
      showToast?.(`💌 Time Capsule "${cap.title}" unsealed!`, 'success');
    },
    [timeCapsules, triggerRefresh, showToast]
  );

  const persistShop = useCallback(
    (next: HomeShopState) => {
      setShopState(next);
      try {
        localStorage.setItem(`focusflow_home_shop_${activeUid}`, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [activeUid]
  );

  const handleClickFloor = useCallback(
    (x: number, z: number) => {
      if (isVisiting) return;
      if (layoutEditMode) {
        const targetId = selectedShopItemId || shopState.placedItems[0]?.itemId;
        if (!targetId) {
          showToast?.('Buy or place an item in Furniture Shop first!', 'info');
          return;
        }
        persistShop(placeOrMoveShopItem(shopState, targetId, x, z));
        setSelectedShopItemId(targetId);
        return;
      }
      const clamped = clampWalkableFloorPosition(x, z);
      setAutoRoutine(false);
      setWalkTarget({ pos: clamped, seq: Date.now() });
    },
    [isVisiting, layoutEditMode, selectedShopItemId, shopState, persistShop, showToast]
  );

  const handleBuyShopItem = useCallback(
    (id: ShopItemId) => {
      const res = purchaseShopItem(shopState, id, availableCoins);
      if (!res.success) {
        showToast?.(res.reason || 'Cannot buy item', 'error');
        return;
      }
      persistShop(res.nextState);
      setSelectedShopItemId(id);
      showToast?.('🛍️ Purchased & placed in your room!', 'success');
    },
    [shopState, availableCoins, persistShop, showToast]
  );

  const handleTogglePlaceShopItem = useCallback(
    (id: ShopItemId) => {
      persistShop(placeOrMoveShopItem(shopState, id, 0, 1.5));
      setSelectedShopItemId(id);
    },
    [shopState, persistShop]
  );

  const handleRotateShopItem = useCallback(
    (id: ShopItemId) => {
      persistShop(rotatePlacedShopItem(shopState, id));
    },
    [shopState, persistShop]
  );

  const handleRemoveShopItem = useCallback(
    (id: ShopItemId) => {
      persistShop(removePlacedShopItem(shopState, id));
      if (selectedShopItemId === id) setSelectedShopItemId(null);
    },
    [shopState, selectedShopItemId, persistShop]
  );

  const petToastCooldownRef = useRef<number>(0);

  const handlePetCompanion = useCallback(() => {
    setPetReactionCue({ type: 'pet', seq: Date.now() });
    setNeeds((prev) => ({ ...prev, mood: Math.min(100, Math.round((prev.mood + 10) * 10) / 10) }));
    const now = Date.now();
    if (now - petToastCooldownRef.current > 4000) {
      petToastCooldownRef.current = now;
      showToast?.('🐾 Petted your companion! +10 Mood', 'success');
    }
  }, [showToast]);

  const handleFeedCompanion = useCallback(() => {
    setPetReactionCue({ type: 'feed', seq: Date.now() });
    setNeeds((prev) => ({
      ...prev,
      energy: Math.min(100, Math.round((prev.energy + 8) * 10) / 10),
      mood: Math.min(100, Math.round((prev.mood + 6) * 10) / 10),
    }));
    const now = Date.now();
    if (now - petToastCooldownRef.current > 4000) {
      petToastCooldownRef.current = now;
      showToast?.('🍖 Fed your companion! +Energy & +Mood', 'success');
    }
  }, [showToast]);

  const handleStartBreathing = useCallback(() => {
    if (breathingSecondsLeft > 0) {
      setBreathingSecondsLeft(0);
      return;
    }
    setBreathingSecondsLeft(60);
    setNeeds((prev) => ({ ...prev, mood: Math.min(100, prev.mood + 8), focus: Math.min(100, prev.focus + 6) }));
    showToast?.('🫧 1-Min Breathing Orb started — Inhale, Hold, Exhale', 'info');
  }, [breathingSecondsLeft, showToast]);

  const handleToggleCoStudyGuests = useCallback(async () => {
    if (showCoStudyGuests) {
      setShowCoStudyGuests(false);
      return;
    }
    setShowCoStudyGuests(true);
    try {
      const guests: VisitorHomeTarget[] = [];
      if (firebaseUser?.uid) {
        const squads = await listUserSquads(firebaseUser.uid);
        const uids = Array.from(
          new Set(squads.flatMap((s) => s.memberUids || []).filter((id) => id && id !== activeUid))
        ).slice(0, 3);
        if (uids.length > 0) {
          const profiles = await fetchSquadMemberProfiles(uids);
          profiles.slice(0, 3).forEach((prof) => {
            guests.push(
              buildVisitorHomeFromLeaderboardProfile(prof, {
                source: 'squad',
                sourceLabel: 'Co-Study Squad',
                isStudyingLive: isProfileStudyingLive(prof),
              })
            );
          });
        }
      }
      if (guests.length === 0) {
        const social = await api.getSocialOverview();
        const friends = social?.friends?.friends || [];
        friends.slice(0, 3).forEach((f: any) => {
          guests.push({
            uid: f.userId,
            displayName: f.displayName || 'Squadmate',
            source: 'friend',
            sourceLabel: 'Co-Study',
            streakDays: Number(f.currentStreak || 0),
            estimatedXP: Number(f.totalXP || 0),
            isStudyingLive: Boolean(f.isOnline),
            studyActivity: f.isOnline ? 'studying' : 'coffee',
            petSpecies: 'cat',
          });
        });
      }
      setCoStudyGuests(guests);
      if (guests.length === 0) {
        showToast?.('No Squadmates online yet — join a Study Squad in Social Hub!', 'info');
      } else {
        showToast?.(`🧑‍🤝‍🧑 ${guests.length} Squadmate(s) joined your room for Co-Study!`, 'success');
      }
    } catch {
      showToast?.('Could not load co-study squad guests right now.', 'error');
    }
  }, [showCoStudyGuests, firebaseUser?.uid, activeUid, showToast]);

  const handleTriggerGuestEmote = useCallback((type: AvatarEmote) => {
    setGuestEmoteEvent({
      id: `emote_${Date.now()}`,
      memberId: activeUid,
      type,
      createdAt: Date.now(),
    });
  }, [activeUid]);

  const handleTakeRoomPostcard = useCallback(() => {
    const snapFn = captureSceneRef.current;
    if (!snapFn) {
      showToast?.('3D scene is still initializing — try again in a moment.', 'info');
      return;
    }
    try {
      const dataUrl = snapFn();
      const img = new Image();
      img.onload = () => {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1280;
        outCanvas.height = 780;
        const ctx = outCanvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#071026';
        ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

        // Draw 3D scene snapshot cleanly into upper 680px
        ctx.drawImage(img, 0, 0, 1280, 680);

        // Sleek bottom postcard footer badge strip
        ctx.fillStyle = '#0e1733';
        ctx.fillRect(0, 680, 1280, 100);
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 680);
        ctx.lineTo(1280, 680);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
        const ownerLabel = visitingTarget
          ? `${visitingTarget.displayName}'s My Home`
          : `${userDisplayName}'s My Home`;
        ctx.fillText(ownerLabel, 36, 722);

        ctx.fillStyle = '#fbbf24';
        ctx.font = '600 18px system-ui, -apple-system, sans-serif';
        ctx.fillText(
          `Lv ${effectiveUnlocksSummary.level} • ${effectiveStreakDays}d Streak • ${apartmentExpansion.tierLabel} • ${seasonState.seasonLabel}`,
          36,
          756
        );

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`FocusFlow & Finance • ${todayStr}`, 1244, 742);

        const pngUrl = outCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `focusflow-my-home-${todayStr}.png`;
        a.click();
        showToast?.('📸 Room Postcard PNG downloaded!', 'success');
      };
      img.src = dataUrl;
    } catch {
      showToast?.('Could not export Room Postcard snapshot.', 'error');
    }
  }, [
    visitingTarget,
    userDisplayName,
    effectiveUnlocksSummary.level,
    effectiveStreakDays,
    apartmentExpansion.tierLabel,
    seasonState.seasonLabel,
    todayStr,
    showToast,
  ]);

  const handleStartKitchenBreak = useCallback(
    (minutes: number) => {
      switchTimerMode('short_break', minutes);
      setCustomDuration(minutes);
      startTimer();
      setAutoRoutine(false);
      setManualZone(minutes <= 5 ? 'kitchen' : 'dining');
      showToast?.(`☕ ${minutes}-minute recharge break started!`, 'success');
    },
    [switchTimerMode, setCustomDuration, startTimer, showToast]
  );

  const handleLogQuickKitchenExpense = useCallback(
    async (payload: {
      description: string;
      amountRupees: number;
      categoryId: string;
      paymentMethod: 'upi_bank' | 'cash' | 'credit_card' | 'debit_card';
    }) => {
      const amountPaise = Math.round(payload.amountRupees * 100);
      await api.createExpense({
        type: 'variable',
        categoryId: payload.categoryId,
        amountPaise,
        date: todayStr,
        description: payload.description,
        paymentMethod: payload.paymentMethod,
        notes: 'Logged from My Home Kitchen/Dining',
      });
      triggerRefresh();
      showToast?.(`Logged ₹${payload.amountRupees} (${payload.description})`, 'success');
    },
    [todayStr, triggerRefresh, showToast]
  );

  const handleSwitchToRiggedAvatar = async () => {
    try {
      const clean = validateAndSanitizeAvatarConfig({
        avatarId: DEFAULT_AVATAR_ID,
        updatedAt: Date.now(),
      });
      setAvatarConfig(clean);
      try {
        localStorage.setItem(`${LOCAL_AVATAR_STORAGE_KEY}_${activeUid}`, JSON.stringify(clean));
      } catch {
        // ignore storage errors
      }
      await updateSettings({ avatarConfig: clean }, { silent: true });
      if (firebaseUser?.uid) {
        await updateUserAvatarConfig(firebaseUser.uid, clean);
      }
      showToast?.('Switched to Yuki (Rigged) for full sit, walk & sleep animations!', 'success');
    } catch {
      showToast?.('Could not switch avatar right now.', 'error');
    }
  };

  const [webglSupported] = useState(() => {
    if (typeof document === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  });

  const zoneButtons: Array<{
    zone: HomeZoneId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { zone: 'study', label: 'Study', icon: LampDesk },
    { zone: 'bedroom', label: 'Sleep', icon: BedDouble },
    { zone: 'dining', label: 'Eat', icon: Utensils },
    { zone: 'kitchen', label: 'Coffee', icon: Coffee },
    { zone: 'washroom', label: 'Washroom', icon: ShowerHead },
  ];

  const lightingOptions: Array<{
    mode: RoomLighting;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { mode: 'afternoon', label: 'Day', icon: Sun },
    { mode: 'sunset', label: 'Sunset', icon: Sunrise },
    { mode: 'night', label: 'Night', icon: Moon },
  ];

  const fallbackUI = (
    <div className="p-10 rounded-3xl border border-slate-800 bg-[#071026] text-center space-y-3 text-slate-300">
      <Home className="w-10 h-10 mx-auto text-indigo-400" />
      <h3 className="text-base font-bold text-white">3D Apartment Requires WebGL</h3>
      <p className="text-xs text-slate-400 max-w-md mx-auto">
        WebGL rendering is unavailable on this browser or hardware configuration. Enable hardware acceleration to explore My Home in 3D.
      </p>
    </div>
  );

  if (!webglSupported) {
    return fallbackUI;
  }

  return (
    <HomeWebGLErrorBoundary fallback={fallbackUI}>
      <div className="relative w-full min-h-[540px] h-[calc(100dvh-10rem)] max-h-[780px] rounded-3xl overflow-hidden border border-indigo-500/20 bg-[#071026] shadow-2xl">
        {/* Interactive R3F Canvas (isolated stacking context so 3D Html labels stay below HUD) */}
        <div className="relative z-0 isolate w-full h-full cursor-grab active:cursor-grabbing">
          <Canvas
            shadows
            dpr={[1, 1.5]}
            gl={{ powerPreference: 'high-performance', antialias: true, preserveDrawingBuffer: true }}
            camera={{ position: HOME_CAMERA_PRESETS.isometric.position, fov: 44, near: 0.1, far: 75 }}
            style={{ width: '100%', height: '100%', touchAction: 'none' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                'webglcontextlost',
                (event) => {
                  event.preventDefault();
                },
                false
              );
            }}
          >
            <HomeSceneContent
              avatarUrl={effectiveAvatarIdentity.modelUrl}
              avatarName={visitingTarget ? visitingTarget.displayName : userDisplayName}
              customization={effectiveAvatarIdentity.customization}
              isStaticUnrigged={effectiveIsStaticUnrigged}
              routineState={effectiveRoutineState}
              lighting={lighting}
              roomStyle={effectiveRoomStyle}
              cameraPreset={cameraPreset}
              resetCounter={resetCounter}
              isWalking={visitingTarget ? false : isWalking}
              clutterLevel={effectiveCleanliness.clutterLevel}
              lampDimFactor={effectiveCleanliness.lampDimFactor}
              unlocks={effectiveUnlocksSummary.unlocks}
              isRaining={ambientPreset === 'rain' || seasonState.showRainWindow}
              petSpecies={visitingTarget ? visitingTarget.petSpecies : petSpecies}
              petStreakDays={effectiveStreakDays}
              hasPetCollar={effectiveUnlocksSummary.pet.hasCollar}
              hasPetBed={effectiveUnlocksSummary.pet.hasLuxuryPetBed}
              isVisiting={isVisiting}
              corkboardTasks={corkboardTasks}
              examSummary={examSummary}
              seasonState={seasonState}
              laptopScreen={laptopScreenState}
              outOfRoom={{
                visible: Boolean(effectiveRoutineState.isOutOfRoom),
                label: effectiveRoutineState.outReason || 'Back Soon',
              }}
              plantStage={plantState.stage}
              vaultSafe={vaultSafe}
              deliveries={deliveries}
              whiteboardPreview={isVisiting ? { dataUrl: null } : latestWhiteboard}
              isFlowStateActive={flowStateSummary.isFlowStateActive}
              hasFourCycleLantern={flowStateSummary.hasFourCycleLantern}
              doomscrollJar={doomscrollJarState}
              bookshelfBooks={bookshelfState.books}
              timeCapsuleChest={timeCapsuleChestState}
              isVinylPlaying={isBinauralPlaying || ambientPreset !== 'off'}
              hydrationState={hydrationState}
              apartmentExpansion={apartmentExpansion}
              hideAvatarForPov={cameraPreset === 'desk_pov' && !isVisiting}
              walkTarget={walkTarget}
              shopPlacedItems={isVisiting ? [] : shopState.placedItems}
              layoutEditMode={!isVisiting && layoutEditMode}
              selectedShopItemId={selectedShopItemId}
              skyState={skyState}
              showFireworks={showFireworks}
              breathingOrb={{ active: breathingSecondsLeft > 0, secondsLeft: breathingSecondsLeft }}
              smartTvData={smartTvData}
              focusAquarium={focusAquarium}
              constellationStars={constellationStars}
              isObservatoryMode={cameraPreset === 'observatory'}
              totalSavedPaise={totalSavedPaise}
              coinDropSeq={coinDropSeq}
              customFrames={isVisiting ? DEFAULT_CUSTOM_FRAMES : customFrames}
              isStandingDesk={isVisiting ? false : isStandingDesk}
              dailyTargetPct={isVisiting ? 0 : examSummary.dailyTargetPct}
              paperAirplaneState={paperAirplaneState}
              dreamGlobe={{ destination: dreamCity, progress: dreamGlobeProgress }}
              vinylSleeves={vinylSleeves}
              activeAmbientPreset={ambientPreset}
              weatherOrbState={weatherOrbState}
              onSelectVinylSleeve={handleSelectVinylSleeve}
              onDropBonusCoin={() => {
                setCoinDropSeq((c) => c + 1);
                showToast?.('🪙 Clink! Dropped a savings coin into your jar!', 'success');
              }}
              petReactionCue={petReactionCue}
              coStudyGuests={showCoStudyGuests ? coStudyGuests : []}
              guestEmoteEvent={guestEmoteEvent}
              onRegisterCapture={(fn) => {
                captureSceneRef.current = fn;
              }}
              onWalkingChange={setIsWalking}
              onSelectZone={handleSelectZone}
              onClickFloor={handleClickFloor}
              onSelectShopItem={setSelectedShopItemId}
              onClickFurniture={handleClickFurniture}
              onCompleteCorkboardTask={handleCompleteCorkboardTask}
              onClickPet={handleTogglePetSpecies}
            />
          </Canvas>
        </div>

        {/* MORNING AWAKENING SEQUENCE OVERLAY PILL */}
        {activeMorningFrame && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-full bg-amber-950/90 border border-amber-400/45 text-xs text-amber-100 shadow-2xl backdrop-blur-md">
            <span>☀️ {activeMorningFrame.label}</span>
            <button
              type="button"
              onClick={() => setMorningElapsedSec(null)}
              className="px-2.5 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-[11px] transition"
            >
              Skip Intro
            </button>
          </div>
        )}

        {/* DESK POV ZEN TOGGLE */}
        {cameraPreset === 'desk_pov' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZenPovHud((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border backdrop-blur-md shadow-lg transition ${
                zenPovHud
                  ? 'bg-indigo-500/80 border-indigo-300 text-white'
                  : 'bg-[#0e1733]/85 border-white/15 text-slate-200 hover:bg-white/10'
              }`}
            >
              {zenPovHud ? 'Show Full HUD' : '🧘 Zen Focus View'}
            </button>
            <button
              type="button"
              onClick={() => {
                setZenPovHud(false);
                setCameraPreset('isometric');
              }}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-950/85 hover:bg-slate-900 border border-white/15 text-slate-200 shadow-lg backdrop-blur-md"
            >
              Exit Desk POV
            </button>
          </div>
        )}

        {/* TOP-LEFT STATUS HUD */}
        {!zenPovHud && (
        <div className="absolute top-16 left-3 right-3 md:top-4 md:left-4 md:right-auto z-20 flex flex-col gap-2 md:max-w-sm pointer-events-none">
          <div className="pointer-events-auto flex items-center justify-between gap-2.5 px-3 py-2 md:px-3.5 md:py-2.5 rounded-2xl bg-[#0e1733]/85 backdrop-blur-md border border-white/12 shadow-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isRunning
                    ? 'bg-red-400 animate-pulse shadow-[0_0_10px_rgba(248,113,113,0.9)]'
                    : routineState.isSleeping
                    ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                }`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
                  <span>{HOME_ZONES[effectiveRoutineState.zone].icon}</span>
                  <span>{visitingTarget ? `${visitingTarget.displayName} · ${HOME_ZONES[effectiveRoutineState.zone].label}` : HOME_ZONES[effectiveRoutineState.zone].label}</span>
                  <span className="text-slate-400 font-normal">•</span>
                  <span className="text-amber-300 font-medium truncate">
                    {!isVisiting && isWalking
                      ? 'Walking...'
                      : ACTIVITY_LABELS[effectiveRoutineState.activity] || HOME_ZONES[effectiveRoutineState.zone].statusText}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-300/80 mt-0.5 truncate">
                  <span>{effectiveRoutineState.reason}</span>
                  {!isVisiting && isRunning && (
                    <button
                      type="button"
                      onClick={() => setCurrentTab('focus')}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-200 border border-red-400/30 font-mono text-[10px] hover:bg-red-500/30"
                    >
                      <Timer className="w-2.5 h-2.5" />
                      {timerEngine === 'stopwatch'
                        ? formatTimerClock(stopwatchElapsed)
                        : formatTimerClock(timeLeft)}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {!isVisiting && (
              <button
                type="button"
                onClick={() => setMobileHudExpanded((v) => !v)}
                className="md:hidden shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-semibold text-indigo-200 transition"
                aria-label={mobileHudExpanded ? 'Collapse room stats' : 'Expand room stats'}
              >
                <span>Lv {effectiveUnlocksSummary.level}</span>
                {mobileHudExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* SIMS-STYLE NEEDS BARS (Energy, Focus, Mood) — collapsible on mobile for unobstructed 3D view */}
          {!isVisiting && (
            <div className={`${mobileHudExpanded ? 'block' : 'hidden md:block'} pointer-events-auto rounded-2xl bg-[#0e1733]/85 backdrop-blur-md border border-white/12 px-3.5 py-2.5 shadow-xl space-y-2`}>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'energy',
                    label: 'Energy',
                    val: needs.energy,
                    icon: BatteryCharging,
                    barClass:
                      needs.energy >= 60
                        ? 'bg-emerald-400'
                        : needs.energy >= 30
                        ? 'bg-amber-400'
                        : 'bg-rose-500',
                    textClass: 'text-emerald-300',
                  },
                  {
                    id: 'focus',
                    label: 'Focus',
                    val: needs.focus,
                    icon: Zap,
                    barClass: 'bg-indigo-400',
                    textClass: 'text-indigo-300',
                  },
                  {
                    id: 'mood',
                    label: 'Mood',
                    val: needs.mood,
                    icon: Smile,
                    barClass: 'bg-pink-400',
                    textClass: 'text-pink-300',
                  },
                ].map((bar) => {
                  const BarIcon = bar.icon;
                  const rounded = Math.round(bar.val);
                  return (
                    <div key={bar.id} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                          <BarIcon className={`w-3 h-3 ${bar.textClass}`} />
                          {bar.label}
                        </span>
                        <span className="font-mono text-slate-300">{rounded}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-900/90 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${bar.barClass}`}
                          style={{ width: `${Math.max(4, Math.min(100, rounded))}%` }}
                          title={`${bar.label}: ${rounded}% (${getNeedStatusLabel(rounded)})`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desk Clutter, Decor, Flow State & Expansion Strip */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-white/10 text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveShortcutModal('wall_schedule')}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border transition ${
                    effectiveCleanliness.clutterLevel > 0
                      ? 'bg-rose-500/15 border-rose-400/35 text-rose-200 hover:bg-rose-500/25'
                      : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25'
                  }`}
                >
                  <span>
                    {effectiveCleanliness.clutterLevel > 0
                      ? `Papers (${effectiveCleanliness.overdueTasksCount + effectiveCleanliness.unpaidBillsCount})`
                      : 'Desk Neat ✨'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShortcutModal('upgrades')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 text-indigo-200 transition"
                >
                  <span>
                    Lv {effectiveUnlocksSummary.level} · Decor {effectiveUnlocksSummary.unlockedCount}/{effectiveUnlocksSummary.totalDecorCount} · {petSpecies === 'cat' ? '🐈' : '🐕'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShortcutModal('exam_season')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-200 transition"
                >
                  <Target className="w-2.5 h-2.5" />
                  <span>
                    {examSummary.hasExam && examSummary.daysLeft !== null
                      ? `${examSummary.daysLeft}d Exam`
                      : seasonState.seasonLabel}
                  </span>
                </button>
                {flowStateSummary.isFlowStateActive && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200">
                    ✨ Flow Aura ({flowStateSummary.elapsedUninterruptedMinutes}m)
                  </span>
                )}
              </div>
            </div>
          )}

          {!isVisiting && isStaticUnrigged && (
            <div className="pointer-events-auto flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-950/85 backdrop-blur-md border border-amber-500/35 text-[11px] text-amber-100 shadow-lg">
              <span className="truncate">Static mesh avatar stays standing safely.</span>
              <button
                type="button"
                onClick={() => void handleSwitchToRiggedAvatar()}
                className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/40 font-semibold text-amber-200 transition"
              >
                Use Rigged Avatar
              </button>
            </div>
          )}
        </div>
        )}

        {/* TOP-RIGHT MODE, LIGHTING & AVATAR CONTROLS (1-row horizontal strip on mobile) */}
        {!zenPovHud && (
        <div className="absolute top-3 left-3 right-3 md:top-4 md:left-auto md:right-4 z-30 flex flex-nowrap overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible items-center justify-start md:justify-end gap-1.5 md:gap-2 pb-0.5">
          {/* Auto-Routine vs Manual Toggle */}
          <button
            type="button"
            onClick={() => setAutoRoutine((v) => !v)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg whitespace-nowrap ${
              autoRoutine
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30'
                : 'bg-amber-500/20 text-amber-200 border-amber-400/40 hover:bg-amber-500/30'
            }`}
            title="Toggle automatic FocusFlow schedule sync vs manual room control"
          >
            {autoRoutine ? <Bot className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />}
            <span>{autoRoutine ? 'Auto-Routine' : 'Manual Mode'}</span>
          </button>

          {/* Room Theme: Level-Up Unlocks (Classic Lv 1 / Anime Studio Lv 3 / Cozy Villa Lv 5) */}
          {!isVisiting && (
            <div className="shrink-0 flex items-center p-1 rounded-xl bg-[#0e1733]/85 backdrop-blur-md border border-white/12 shadow-lg">
              {HOME_ROOM_CATALOG.map((opt) => {
                const unlocked = currentLevel >= opt.unlockLevel;
                const active = effectiveRoomStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleChangeRoomStyle(opt.id)}
                    title={
                      unlocked
                        ? `Switch to ${opt.label} room`
                        : `Reach Level ${opt.unlockLevel} to unlock ${opt.label}`
                    }
                    className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
                      active
                        ? 'bg-violet-500/45 text-white border border-violet-400/55'
                        : unlocked
                          ? 'text-slate-300 hover:text-white'
                          : 'text-slate-500 hover:text-slate-300 opacity-75'
                    }`}
                  >
                    <Home className="w-3 h-3" />
                    <span>{opt.label}</span>
                    {!unlocked && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/90 text-amber-300 border border-amber-400/30">
                        🔒Lv{opt.unlockLevel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Day / Sunset / Night Toggle */}
          <div className="shrink-0 flex items-center p-1 rounded-xl bg-[#0e1733]/85 backdrop-blur-md border border-white/12 shadow-lg">
            {lightingOptions.map((opt) => {
              const Icon = opt.icon;
              const active = lighting === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setLighting(opt.mode)}
                  className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                    active
                      ? 'bg-indigo-500/40 text-white border border-indigo-400/50'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Visit Squad / Partner Home Button */}
          <button
            type="button"
            onClick={() => void openVisitHomeModal()}
            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg whitespace-nowrap ${
              isVisiting
                ? 'bg-cyan-500/25 text-cyan-100 border-cyan-400/50 hover:bg-cyan-500/35'
                : 'bg-[#0e1733]/85 hover:bg-cyan-500/25 text-slate-200 border-white/12'
            }`}
            title="Visit a Study Squad member or Joint Vault partner's apartment (Privacy-Safe)"
          >
            <Users className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden md:inline">{isVisiting ? 'Switch Home' : 'Visit Home'}</span>
          </button>

          {/* Window / Ambient Audio Quick Cycle */}
          <button
            type="button"
            onClick={() => handleClickFurniture('window_speaker')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg whitespace-nowrap ${
              ambientPreset !== 'off'
                ? 'bg-sky-500/25 text-sky-100 border-sky-400/45 hover:bg-sky-500/35'
                : 'bg-[#0e1733]/85 hover:bg-white/10 text-slate-300 border-white/12'
            }`}
            title="Cycle Window Ambient Audio (Rain / Cafe / Lo-Fi / Off)"
          >
            {ambientPreset !== 'off' ? (
              <Volume2 className="w-3.5 h-3.5 text-sky-300" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="hidden lg:inline capitalize">
              {ambientPreset === 'off' ? 'Sound' : ambientPreset === 'drone' ? 'Lo-Fi' : ambientPreset}
            </span>
          </button>

          {/* 1-Click End Day Sleep Ritual */}
          {!isVisiting && (
            <button
              type="button"
              onClick={() => setActiveShortcutModal('end_day')}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1733]/85 hover:bg-indigo-500/30 text-indigo-200 backdrop-blur-md border border-white/12 transition shadow-lg whitespace-nowrap"
              title="End Day Daily Wrap-Up & Moonlight Sleep Ritual"
            >
              <Moon className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden lg:inline">End Day</span>
            </button>
          )}

          {/* Pet / Feed / 1m Breathe / Shop / Co-Study Controls */}
          {!isVisiting && (
            <>
              <button
                type="button"
                onClick={handlePetCompanion}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-[#0e1733]/85 hover:bg-pink-500/25 text-pink-200 backdrop-blur-md border border-white/12 transition shadow-lg whitespace-nowrap"
                title="Pet your companion (+Mood)"
              >
                <Heart className="w-3.5 h-3.5 text-pink-300" />
                <span className="hidden xl:inline">Pet</span>
              </button>
              <button
                type="button"
                onClick={handleFeedCompanion}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-[#0e1733]/85 hover:bg-amber-500/25 text-amber-200 backdrop-blur-md border border-white/12 transition shadow-lg whitespace-nowrap"
                title="Feed your companion (+Energy)"
              >
                <span className="text-xs">🍖</span>
                <span className="hidden xl:inline">Feed</span>
              </button>
              <button
                type="button"
                onClick={handleStartBreathing}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg whitespace-nowrap ${
                  breathingSecondsLeft > 0
                    ? 'bg-sky-500/30 text-sky-100 border-sky-400/50'
                    : 'bg-[#0e1733]/85 hover:bg-sky-500/25 text-sky-200 border-white/12'
                }`}
                title="Start 1-minute 3D Breathing Orb session"
              >
                <Wind className="w-3.5 h-3.5 text-sky-300" />
                <span className="hidden lg:inline">
                  {breathingSecondsLeft > 0 ? `${breathingSecondsLeft}s` : 'Breathe'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveShortcutModal('shop')}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg whitespace-nowrap ${
                  layoutEditMode
                    ? 'bg-emerald-500/30 text-emerald-100 border-emerald-400/50'
                    : 'bg-[#0e1733]/85 hover:bg-amber-500/25 text-amber-200 border-white/12'
                }`}
                title="3D Furniture Shop & Grid Layout Editor"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden lg:inline">🪙 {availableCoins}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleToggleCoStudyGuests()}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg whitespace-nowrap ${
                  showCoStudyGuests
                    ? 'bg-emerald-500/25 text-emerald-100 border-emerald-400/50'
                    : 'bg-[#0e1733]/85 hover:bg-emerald-500/20 text-slate-200 border-white/12'
                }`}
                title="Seat up to 3 live Squadmates in your room (Co-Study)"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-300" />
                <span className="hidden lg:inline">Co-Study</span>
              </button>
              {showCoStudyGuests && coStudyGuests.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleTriggerGuestEmote('wave')}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-100 border border-emerald-400/40 transition shadow-lg"
                  title="Wave / Clap to Co-Study Guests"
                >
                  👋
                </button>
              )}
            </>
          )}

          {/* 1-Click Room Postcard PNG Snapshot */}
          <button
            type="button"
            onClick={handleTakeRoomPostcard}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1733]/85 hover:bg-amber-500/25 text-amber-200 backdrop-blur-md border border-white/12 transition shadow-lg whitespace-nowrap"
            title="Download Room Postcard Snapshot PNG"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden lg:inline">Postcard</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('avatar_studio')}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1733]/85 hover:bg-indigo-500/30 text-slate-200 backdrop-blur-md border border-white/12 transition shadow-lg whitespace-nowrap"
            title="Customize your 3D avatar"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            <span className="hidden md:inline">Avatar</span>
          </button>
        </div>
        )}

        {/* PRIVACY-SAFE VISITOR BANNER */}
        {visitingTarget && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 px-4 py-2 rounded-full bg-cyan-950/90 border border-cyan-400/45 text-xs text-cyan-100 shadow-2xl backdrop-blur-md">
            <span>
              Viewing <strong>{visitingTarget.displayName}</strong>&apos;s Apartment · Read-Only Privacy Mode ({visitingTarget.streakDays}d streak)
            </span>
            <button
              type="button"
              onClick={() => setActiveShortcutModal('upgrades')}
              className="px-2.5 py-1 rounded-full bg-indigo-500/35 hover:bg-indigo-500/50 border border-indigo-400/45 text-indigo-100 font-semibold text-[11px] transition"
            >
              Decor {effectiveUnlocksSummary.unlockedCount}/{effectiveUnlocksSummary.totalDecorCount} ·{' '}
              {visitingTarget.petSpecies === 'cat' ? '🐈' : '🐕'}
            </button>
            <button
              type="button"
              onClick={() => setVisitingTarget(null)}
              className="px-2.5 py-1 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-[11px] transition"
            >
              Return Home
            </button>
          </div>
        )}

        {/* BOTTOM NAVIGATION & CAMERA CONTROLS */}
        <div className="absolute bottom-3 inset-x-3 md:bottom-4 md:inset-x-4 z-20 flex flex-col md:flex-row md:items-center md:justify-between gap-2 pointer-events-none">
          {/* Quick Room / Action Buttons (single scrollable row on mobile) */}
          <div className="pointer-events-auto flex flex-nowrap overflow-x-auto no-scrollbar max-w-full items-center gap-1 p-1.5 rounded-2xl bg-[#0e1733]/88 backdrop-blur-md border border-white/12 shadow-xl">
            {zoneButtons.map((btn) => {
              const Icon = btn.icon;
              const active = routineState.zone === btn.zone;
              return (
                <button
                  key={btn.zone}
                  type="button"
                  onClick={() => handleSelectZone(btn.zone)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    active
                      ? 'bg-indigo-500/45 text-white border border-indigo-400/55 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 text-amber-300" />
                  <span>{btn.label}</span>
                </button>
              );
            })}
            {!autoRoutine && (
              <button
                type="button"
                onClick={() => setAutoRoutine(true)}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/35 whitespace-nowrap transition"
                title="Resume Auto-Routine"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Auto</span>
              </button>
            )}
          </div>

          {/* Camera Presets */}
          <div className="pointer-events-auto self-start md:self-auto flex flex-nowrap overflow-x-auto no-scrollbar max-w-[calc(100%-3.5rem)] md:max-w-full items-center gap-1 p-1.5 rounded-2xl bg-[#0e1733]/88 backdrop-blur-md border border-white/12 shadow-xl">
            {(
              [
                { id: 'isometric', label: 'Isometric', icon: Camera },
                { id: 'free', label: 'Free 360°', icon: Eye },
                { id: 'desk_pov', label: 'Desk POV', icon: Laptop },
                { id: 'observatory', label: 'Star Sky', icon: Star },
                { id: 'follow', label: 'Follow Character', icon: GraduationCap },
              ] as const
            ).map((cam) => {
              const Icon = cam.icon;
              const active = cameraPreset === cam.id;
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => setCameraPreset(cam.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition ${
                    active
                      ? 'bg-indigo-500/45 text-white border border-indigo-400/55'
                      : 'text-slate-300 hover:text-white hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <Icon className="w-3 h-3 text-indigo-300" />
                  <span className="hidden sm:inline">{cam.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setResetCounter((c) => c + 1)}
              className="shrink-0 p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition"
              title="Reset camera angle"
              aria-label="Reset camera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SHORTCUT & FEATURE MODALS */}
      {activeShortcutModal === 'wall_schedule' && (
        <WallSchedulePopup
          cleanliness={ownCleanliness}
          onClose={() => setActiveShortcutModal(null)}
          onNavigateTasks={() => {
            setActiveShortcutModal(null);
            setCurrentTab('tasks');
          }}
          onNavigateBills={() => {
            setActiveShortcutModal(null);
            setCurrentTab('bills');
          }}
        />
      )}

      {activeShortcutModal === 'kitchen_dining' && (
        <KitchenDiningPopup
          categories={categoriesData}
          onStartBreak={handleStartKitchenBreak}
          onLogQuickExpense={handleLogQuickKitchenExpense}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'upgrades' && (
        <UpgradesAndPetModal
          unlocksSummary={effectiveUnlocksSummary}
          petSpecies={visitingTarget ? visitingTarget.petSpecies : petSpecies}
          onChangePetSpecies={isVisiting ? undefined : handleSetPetSpecies}
          apartmentTierOverride={apartmentTierOverride}
          onChangeApartmentTierOverride={isVisiting ? undefined : handleChangeApartmentTierOverride}
          isVisiting={isVisiting}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'end_day' && (
        <EndDaySleepModal
          stats={dailyWrapUpStats}
          onConfirmSleep={handleConfirmEndDaySleep}
          onWalkOnly={() => handleSelectZone('bedroom')}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'exam_season' && (
        <ExamAndSeasonModal
          examSummary={examSummary}
          todayStr={todayStr}
          birthDate={settings?.birthDate}
          seasonOverride={seasonOverride}
          customExamTitle={customExamOverride?.title || ''}
          customExamDate={customExamOverride?.examDate || ''}
          onSaveCustomExam={handleSaveCustomExam}
          onSaveBirthDate={handleSaveBirthDate}
          onChangeSeasonOverride={handleChangeSeasonOverride}
          onReplayMorningSequence={() => setMorningElapsedSec(0)}
          onOpenStudyExams={() => {
            try {
              sessionStorage.setItem('focusflow_study_initial_subtab', 'exams');
            } catch {
              // ignore
            }
            setCurrentTab('study');
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'parcel_mail' && (
        <DoorstepParcelMailModal
          state={deliveries}
          onNavigateTransactions={() => setCurrentTab('transactions')}
          onNavigateBills={() => setCurrentTab('bills')}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'doomscroll_jar' && (
        <DoomscrollJarModal
          state={doomscrollJarState}
          savingsGoals={savingsGoalsData}
          onClearJarToGoal={handleSweepDoomscrollJarToGoal}
          onOpenFullTaxJar={() => {
            try {
              sessionStorage.setItem('focusflow_dashboard_initial_subtab', 'doomscroll');
            } catch {
              // ignore
            }
            setCurrentTab('dashboard');
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'time_capsule' && (
        <TimeCapsuleQuickModal
          state={timeCapsuleChestState}
          onOpenCapsule={handleUnsealTimeCapsule}
          onOpenFullCapsules={() => {
            try {
              sessionStorage.setItem('focusflow_dashboard_initial_subtab', 'timecapsule');
            } catch {
              // ignore
            }
            setCurrentTab('dashboard');
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}


      {activeShortcutModal === 'shop' && (
        <FurnitureShopModal
          shopState={shopState}
          availableCoins={availableCoins}
          layoutEditMode={layoutEditMode}
          onBuyItem={handleBuyShopItem}
          onTogglePlaceItem={handleTogglePlaceShopItem}
          onRotateItem={handleRotateShopItem}
          onRemoveItem={handleRemoveShopItem}
          onToggleLayoutEditMode={() => setLayoutEditMode((v) => !v)}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}

      {activeShortcutModal === 'custom_frames' && (
        <CustomWallFramesModal
          frames={customFrames}
          onSaveFrame={(updated) => {
            const next = customFrames.map((f) => (f.id === updated.id ? updated : f));
            setCustomFrames(next);
            try {
              localStorage.setItem(`focusflow_home_frames_${activeUid}`, JSON.stringify(next));
            } catch {
              // ignore
            }
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}

      {activeShortcutModal === 'arcade' && (
        <ArcadeMiniGameModal
          highScore={arcadeHighScore}
          onUpdateHighScore={(score) => {
            setArcadeHighScore(score);
            try {
              localStorage.setItem(`focusflow_home_arcade_hs_${activeUid}`, String(score));
            } catch {
              // ignore
            }
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}

      {activeShortcutModal === 'paper_plane' && (
        <PaperAirplaneInboxModal
          messages={paperMessages}
          onMarkAllRead={() => {
            const next = paperMessages.map((m) => ({ ...m, read: true }));
            setPaperMessages(next);
            try {
              localStorage.setItem(`focusflow_home_paper_notes_${activeUid}`, JSON.stringify(next));
            } catch {
              // ignore
            }
          }}
          onSendSelfNote={(text) => {
            const next: PaperAirplaneMessage[] = [
              {
                id: `plane-${Date.now()}`,
                senderName: userDisplayName || 'You',
                sourceLabel: 'Personal Note',
                message: text,
                createdAt: new Date().toISOString(),
                read: false,
              },
              ...paperMessages,
            ].slice(0, 12);
            setPaperMessages(next);
            try {
              localStorage.setItem(`focusflow_home_paper_notes_${activeUid}`, JSON.stringify(next));
            } catch {
              // ignore
            }
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}

      {activeShortcutModal === 'dream_globe' && (
        <DreamGlobeModal
          current={dreamCity}
          bestSavingsPct={effectiveUnlocksSummary.bestSavingsPct}
          onSelectDestination={(city) => {
            setDreamCity(city);
            try {
              localStorage.setItem(`focusflow_home_dream_city_${activeUid}`, city.id);
            } catch {
              // ignore
            }
            showToast?.(`🌍 Dream Globe set to ${city.city}, ${city.country}!`, 'success');
          }}
          onClose={() => setActiveShortcutModal(null)}
        />
      )}

      {visitModalOpen && (
        <VisitHomeModal
          visitors={visitorList}
          loading={visitLoading}
          activeVisitorUid={visitingTarget?.uid || null}
          onSelectVisitor={(visitor) => {
            setVisitingTarget(visitor);
            showToast?.(`Visiting ${visitor.displayName}'s 3D Apartment (Privacy-Safe Read-Only)`, 'info');
          }}
          onReturnHome={() => {
            setVisitingTarget(null);
            showToast?.('Returned to your apartment', 'success');
          }}
          onClose={() => setVisitModalOpen(false)}
        />
      )}
    </HomeWebGLErrorBoundary>
  );
};

export default MyHomeView;

