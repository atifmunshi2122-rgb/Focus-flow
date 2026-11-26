import type { ExpenseTransaction, FocusSession, Habit } from '../../types/index.ts';
import type { SkillNode } from '../../types/features15.ts';
import type { StudySubject, StudyTopic } from '../../types/study.ts';
import { addDays, formatDateInTimezone } from '../../lib/dateTime.ts';

export type ShopItemId =
  | 'fish_aquarium'
  | 'bean_bag'
  | 'rgb_led_strip'
  | 'wall_poster'
  | 'floor_lamp'
  | 'bonsai_tree';

export interface ShopCatalogItem {
  id: ShopItemId;
  name: string;
  priceCoins: number;
  icon: string;
  description: string;
  defaultPosition: [number, number, number];
  defaultRotationY: number;
}

export interface PlacedShopItem {
  itemId: ShopItemId;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface HomeShopState {
  ownedIds: ShopItemId[];
  placedItems: PlacedShopItem[];
  spentCoins: number;
}

export const SHOP_CATALOG: readonly ShopCatalogItem[] = [
  {
    id: 'fish_aquarium',
    name: 'Glowing Fish Aquarium',
    priceCoins: 80,
    icon: '🐠',
    description: 'Animated neon-lit glass aquarium with swimming fish',
    defaultPosition: [1.5, 0, 1.5],
    defaultRotationY: 0,
  },
  {
    id: 'bean_bag',
    name: 'Cozy Indigo Bean Bag',
    priceCoins: 60,
    icon: '🛋️',
    description: 'Plush reading & break lounger on the oak floor',
    defaultPosition: [-2.5, 0, 1.5],
    defaultRotationY: 0.4,
  },
  {
    id: 'floor_lamp',
    name: 'Tripod Studio Lamp',
    priceCoins: 75,
    icon: '🛋️',
    description: 'Warm Scandinavian wood tripod floor lamp',
    defaultPosition: [2.0, 0, -0.5],
    defaultRotationY: 0,
  },
  {
    id: 'bonsai_tree',
    name: 'Zen Bonsai Tree',
    priceCoins: 65,
    icon: '🪴',
    description: 'Sculpted miniature bonsai on ceramic display stand',
    defaultPosition: [-1.0, 0, 2.0],
    defaultRotationY: 0,
  },
  {
    id: 'rgb_led_strip',
    name: 'Desk RGB LED Strip',
    priceCoins: 50,
    icon: '🌈',
    description: 'Ambient cyan-violet underglow bar for your floor/desk edge',
    defaultPosition: [-3.5, 0, 1.5],
    defaultRotationY: Math.PI / 2,
  },
  {
    id: 'wall_poster',
    name: 'Minimalist Focus Poster',
    priceCoins: 40,
    icon: '🖼️',
    description: 'Sleek framed geometric standee poster',
    defaultPosition: [0.5, 0, -1.0],
    defaultRotationY: 0,
  },
];

export const DEFAULT_HOME_SHOP_STATE: HomeShopState = {
  ownedIds: [],
  placedItems: [],
  spentCoins: 0,
};

export function snapToHomeGrid(x: number, z: number, gridSize = 0.5): { x: number; z: number } {
  const sx = Math.round(x / gridSize) * gridSize;
  const sz = Math.round(z / gridSize) * gridSize;
  return {
    x: Math.max(-3.5, Math.min(2.2, sx)),
    z: Math.max(-1.0, Math.min(2.4, sz)),
  };
}

export function computeFocusCoinsBalance(params: {
  totalXP: number;
  completedWorkCyclesToday: number;
  spentCoins: number;
}): number {
  const earned =
    150 +
    Math.max(0, Math.floor((Number(params.totalXP) || 0) / 10)) +
    Math.max(0, Math.floor(params.completedWorkCyclesToday || 0)) * 15;
  return Math.max(0, earned - Math.max(0, Math.floor(params.spentCoins || 0)));
}

export function purchaseShopItem(
  state: HomeShopState,
  itemId: ShopItemId,
  availableCoins: number
): { nextState: HomeShopState; success: boolean; reason?: string } {
  if (state.ownedIds.includes(itemId)) {
    return { nextState: state, success: false, reason: 'Already owned' };
  }
  const item = SHOP_CATALOG.find((c) => c.id === itemId);
  if (!item) return { nextState: state, success: false, reason: 'Unknown item' };
  if (availableCoins < item.priceCoins) {
    return { nextState: state, success: false, reason: `Need ${item.priceCoins - availableCoins} more Focus Coins` };
  }
  const snapped = snapToHomeGrid(item.defaultPosition[0], item.defaultPosition[2]);
  return {
    success: true,
    nextState: {
      ownedIds: [...state.ownedIds, itemId],
      placedItems: [
        ...state.placedItems,
        {
          itemId,
          x: snapped.x,
          y: 0,
          z: snapped.z,
          rotationY: item.defaultRotationY,
        },
      ],
      spentCoins: state.spentCoins + item.priceCoins,
    },
  };
}

export function placeOrMoveShopItem(
  state: HomeShopState,
  itemId: ShopItemId,
  rawX: number,
  rawZ: number,
  rotationY?: number
): HomeShopState {
  if (!state.ownedIds.includes(itemId)) return state;
  const snapped = snapToHomeGrid(rawX, rawZ, 0.5);
  const existing = state.placedItems.find((p) => p.itemId === itemId);
  const catalog = SHOP_CATALOG.find((c) => c.id === itemId);
  const nextRot = rotationY ?? existing?.rotationY ?? catalog?.defaultRotationY ?? 0;

  const filtered = state.placedItems.filter((p) => p.itemId !== itemId);
  return {
    ...state,
    placedItems: [...filtered, { itemId, x: snapped.x, y: 0, z: snapped.z, rotationY: nextRot }],
  };
}

export function rotatePlacedShopItem(state: HomeShopState, itemId: ShopItemId): HomeShopState {
  return {
    ...state,
    placedItems: state.placedItems.map((p) =>
      p.itemId === itemId ? { ...p, rotationY: (p.rotationY + Math.PI / 2) % (Math.PI * 2) } : p
    ),
  };
}

export function removePlacedShopItem(state: HomeShopState, itemId: ShopItemId): HomeShopState {
  return {
    ...state,
    placedItems: state.placedItems.filter((p) => p.itemId !== itemId),
  };
}

export interface MonthlyBudgetSummary {
  spentPaiseThisMonth: number;
  budgetPaise: number;
  budgetPct: number;
}

export function computeMonthlyBudgetSummary(params: {
  expenses: ReadonlyArray<Pick<ExpenseTransaction, 'amountPaise' | 'date' | 'deletedAt'>>;
  monthlyBudgetPaise?: number | null;
  todayStr: string;
}): MonthlyBudgetSummary {
  const monthPrefix = params.todayStr.slice(0, 7);
  let spentPaiseThisMonth = 0;
  for (const e of params.expenses) {
    if (!e || e.deletedAt || !e.date) continue;
    if (e.date.startsWith(monthPrefix)) {
      spentPaiseThisMonth += Math.max(0, Number(e.amountPaise || 0));
    }
  }
  const budgetPaise = Math.max(100000, Number(params.monthlyBudgetPaise) || 1500000);
  const budgetPct = Math.min(100, Math.round((spentPaiseThisMonth / budgetPaise) * 100));
  return { spentPaiseThisMonth, budgetPaise, budgetPct };
}

export interface HeatmapCell {
  date: string;
  level: 0 | 1 | 2 | 3;
}

export function computeStreakHeatmapDays(params: {
  sessions: ReadonlyArray<Pick<FocusSession, 'mode' | 'startedAt' | 'completed'>>;
  habits: ReadonlyArray<Pick<Habit, 'archived' | 'deletedAt' | 'completedDates'>>;
  todayStr: string;
  timezone: string;
  daysCount?: number;
}): HeatmapCell[] {
  const count = params.daysCount ?? 14;
  const counts = new Map<string, number>();

  for (const s of params.sessions) {
    if (!s || !s.completed || s.mode !== 'work' || !s.startedAt) continue;
    try {
      const d = formatDateInTimezone(s.startedAt, params.timezone);
      counts.set(d, (counts.get(d) || 0) + 1);
    } catch {
      // ignore
    }
  }

  for (const h of params.habits) {
    if (!h || h.archived || h.deletedAt) continue;
    for (const d of h.completedDates || []) {
      counts.set(d, (counts.get(d) || 0) + 1);
    }
  }

  const out: HeatmapCell[] = [];
  for (let offset = -(count - 1); offset <= 0; offset += 1) {
    const d = addDays(params.todayStr, offset);
    const total = counts.get(d) || 0;
    const level: 0 | 1 | 2 | 3 = total === 0 ? 0 : total <= 2 ? 1 : total <= 4 ? 2 : 3;
    out.push({ date: d, level });
  }
  return out;
}

export interface SunMoonSkyState {
  isNight: boolean;
  orbY: number;
  orbZ: number;
  orbColor: string;
}

/**
 * Deterministic Sun / Moon arc outside Left Wall Window (-5.35, orbY, orbZ).
 */
export function computeSunMoonSkyPosition(hour: number, minute: number, isNightLighting: boolean): SunMoonSkyState {
  const h = (hour % 24) + (minute % 60) / 60;
  const isNight = isNightLighting || h >= 19 || h < 6;

  if (isNight) {
    const nightProgress = h >= 19 ? (h - 19) / 11 : (h + 5) / 11;
    const arc = Math.sin(Math.max(0.05, Math.min(0.95, nightProgress)) * Math.PI);
    return {
      isNight: true,
      orbY: 1.55 + arc * 0.95,
      orbZ: -1.2 + nightProgress * 1.7,
      orbColor: '#e0f2fe',
    };
  }

  const dayProgress = Math.max(0, Math.min(1, (h - 6) / 13));
  const arc = Math.sin(dayProgress * Math.PI);
  return {
    isNight: false,
    orbY: 1.45 + arc * 1.05,
    orbZ: -1.25 + dayProgress * 1.8,
    orbColor: h >= 16.5 ? '#fb923c' : '#fde047',
  };
}

export interface FocusAquariumState {
  totalCompletedPomodoros: number;
  sessionsToday: number;
  hasCoral: boolean;
  fishCount: number;
  hasJellyfish: boolean;
  isMisty: boolean;
}

export function computeFocusAquariumState(params: {
  sessions: ReadonlyArray<Pick<FocusSession, 'mode' | 'startedAt' | 'completed'>>;
  streakDays: number;
  todayStr: string;
  timezone: string;
}): FocusAquariumState {
  let totalCompletedPomodoros = 0;
  let sessionsToday = 0;

  for (const s of params.sessions) {
    if (!s || s.mode !== 'work' || !s.completed) continue;
    totalCompletedPomodoros += 1;
    if (s.startedAt) {
      try {
        if (formatDateInTimezone(s.startedAt, params.timezone) === params.todayStr) {
          sessionsToday += 1;
        }
      } catch {
        // ignore invalid timestamp
      }
    }
  }

  return {
    totalCompletedPomodoros,
    sessionsToday,
    hasCoral: totalCompletedPomodoros >= 1,
    fishCount:
      totalCompletedPomodoros >= 1
        ? Math.min(4, Math.ceil(totalCompletedPomodoros / 2))
        : 0,
    hasJellyfish: totalCompletedPomodoros >= 6,
    isMisty: params.streakDays === 0 && sessionsToday === 0,
  };
}

export interface ConstellationStar {
  id: string;
  label: string;
  kind: 'study' | 'skill' | 'guide';
  pos: [number, number, number];
  color: string;
  unlocked: boolean;
}

export function computeConstellationStars(params: {
  subjects: ReadonlyArray<Pick<StudySubject, 'code' | 'color' | 'deletedAt'>>;
  topics: ReadonlyArray<Pick<StudyTopic, 'id' | 'topic' | 'subjectCode' | 'theory' | 'practice' | 'pyq' | 'deletedAt'>>;
  skillNodes: ReadonlyArray<Pick<SkillNode, 'id' | 'title' | 'status'>>;
}): ConstellationStar[] {
  const colorBySubject = new Map(
    params.subjects.filter((s) => s && !s.deletedAt).map((s) => [s.code, s.color || '#38bdf8'])
  );

  const stars: ConstellationStar[] = [];

  // Mastered Study OS topics
  const masteredTopics = params.topics.filter(
    (t) => t && !t.deletedAt && ((t.theory && t.practice) || (t.theory && t.pyq))
  );
  masteredTopics.slice(0, 10).forEach((t, idx) => {
    stars.push({
      id: `topic_${t.id}`,
      label: t.topic || t.subjectCode,
      kind: 'study',
      pos: [
        -6.8 + ((idx * 1.15) % 7.5),
        4.1 + ((idx * 0.43) % 1.45),
        -6.6 + ((idx * 0.72) % 2.1),
      ],
      color: colorBySubject.get(t.subjectCode) || '#38bdf8',
      unlocked: true,
    });
  });

  // Completed RPG Skill Nodes
  const completedSkills = params.skillNodes.filter((n) => n && n.status === 'completed');
  completedSkills.slice(0, 8).forEach((n, idx) => {
    stars.push({
      id: `skill_${n.id}`,
      label: n.title,
      kind: 'skill',
      pos: [
        -5.9 + ((idx * 1.35) % 6.8),
        4.4 + ((idx * 0.37) % 1.35),
        -6.1 + ((idx * 0.88) % 1.9),
      ],
      color: '#fde047',
      unlocked: true,
    });
  });

  // Fallback subtle guide stars so the observatory sky is always readable
  if (stars.length < 4) {
    const guides: Array<[number, number, number]> = [
      [-6.2, 4.5, -5.8],
      [-4.6, 5.1, -6.2],
      [-2.8, 4.7, -5.4],
      [-1.4, 5.3, -6.0],
    ];
    guides.slice(0, 4 - stars.length).forEach((pos, idx) => {
      stars.push({
        id: `guide_${idx}`,
        label: 'Master topics or skills to light this star',
        kind: 'guide',
        pos,
        color: '#64748b',
        unlocked: false,
      });
    });
  }

  return stars;
}

export type WallFramePreset = 'cyber_dusk' | 'sakura_horizon' | 'focus_grid' | 'custom';

export interface CustomWallFrameConfig {
  id: 'custom_frame_1' | 'custom_frame_2';
  preset: WallFramePreset;
  title: string;
  imageDataUrl: string | null;
}

export const DEFAULT_CUSTOM_FRAMES: CustomWallFrameConfig[] = [
  { id: 'custom_frame_1', preset: 'cyber_dusk', title: 'Vision Board', imageDataUrl: null },
  { id: 'custom_frame_2', preset: 'sakura_horizon', title: 'Dream Poster', imageDataUrl: null },
];


