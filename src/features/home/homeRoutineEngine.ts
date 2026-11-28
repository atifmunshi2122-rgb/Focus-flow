import type { StudyAvatarActivity } from '../../components/study-room/StudyAvatar.tsx';
import type { RoomLighting } from '../study-room/customization-types.ts';
import type { TimerEngineMode, TimerMode } from '../../lib/timerEngine.ts';
import { getHomeRoomTheme, type HomeRoomStyle } from './homeRoomCatalog.ts';

export type HomeZoneId = 'study' | 'bedroom' | 'kitchen' | 'dining' | 'washroom';

export type HomePoseMode = 'standing' | 'seated' | 'sleeping';

export interface HomeZoneConfig {
  id: HomeZoneId;
  label: string;
  actionLabel: string;
  icon: string;
  activity: StudyAvatarActivity;
  poseMode: HomePoseMode;
  anchorPosition: [number, number, number];
  approachPosition: [number, number, number];
  targetRotationY: number;
  statusText: string;
  supportsStaticStandingOnlyFallback: boolean;
}

export const HOME_ZONES: Record<HomeZoneId, HomeZoneConfig> = {
  study: {
    id: 'study',
    label: 'Study Corner',
    actionLabel: 'Study',
    icon: '💻',
    activity: 'typing',
    poseMode: 'seated',
    anchorPosition: [-3.30, 0, 1.05],
    approachPosition: [-2.60, 0, 1.05],
    targetRotationY: -Math.PI / 2, // Facing -X toward laptop & left wall
    statusText: 'Studying at Desk',
    supportsStaticStandingOnlyFallback: true,
  },
  bedroom: {
    id: 'bedroom',
    label: 'Bedroom',
    actionLabel: 'Sleep',
    icon: '🛏️',
    activity: 'sleeping',
    poseMode: 'sleeping',
    anchorPosition: [-2.12, 0.54, -1.48],
    approachPosition: [-1.50, 0, -0.60],
    targetRotationY: 0, // Local -Z (head) aligns toward -Z headboard pillow
    statusText: 'Sleeping on Bed',
    supportsStaticStandingOnlyFallback: true,
  },
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen',
    actionLabel: 'Coffee',
    icon: '☕',
    activity: 'coffee',
    poseMode: 'standing',
    anchorPosition: [1.55, 0, -2.02],
    approachPosition: [1.45, 0, -1.25],
    targetRotationY: Math.PI, // Facing -Z toward coffee maker & counter
    statusText: 'Brewing Coffee',
    supportsStaticStandingOnlyFallback: false,
  },
  dining: {
    id: 'dining',
    label: 'Dining Table',
    actionLabel: 'Eat',
    icon: '🍽️',
    activity: 'eating',
    poseMode: 'seated',
    anchorPosition: [-0.15, 0, 0.14],
    approachPosition: [-0.95, 0, -0.35],
    targetRotationY: 0, // Facing +Z across dining table toward camera
    statusText: 'Eating & Relaxing',
    supportsStaticStandingOnlyFallback: true,
  },
  washroom: {
    id: 'washroom',
    label: 'Washroom',
    actionLabel: 'Washroom',
    icon: '🚿',
    activity: 'freshening_up',
    poseMode: 'standing',
    anchorPosition: [4.02, 0.08, -1.05],
    approachPosition: [3.62, 0.08, -0.20],
    targetRotationY: Math.PI / 2, // Facing +X toward vessel sink & LED mirror
    statusText: 'Freshening Up',
    supportsStaticStandingOnlyFallback: false,
  },
};

export interface WaypointNode {
  id: string;
  position: [number, number, number];
}

export const HOME_WAYPOINT_NODES: Record<string, WaypointNode> = {
  study_seat: { id: 'study_seat', position: HOME_ZONES.study.anchorPosition },
  study_approach: { id: 'study_approach', position: HOME_ZONES.study.approachPosition },
  hall_west: { id: 'hall_west', position: [-1.85, 0, 0.45] },
  hall_center: { id: 'hall_center', position: [-1.20, 0, -0.35] },
  bed_approach: { id: 'bed_approach', position: HOME_ZONES.bedroom.approachPosition },
  bed_sleep: { id: 'bed_sleep', position: HOME_ZONES.bedroom.anchorPosition },
  dining_approach: { id: 'dining_approach', position: HOME_ZONES.dining.approachPosition },
  dining_back: { id: 'dining_back', position: [-0.15, 0, -0.35] },
  dining_seat: { id: 'dining_seat', position: HOME_ZONES.dining.anchorPosition },
  hall_east: { id: 'hall_east', position: [1.35, 0, -0.35] },
  kitchen_approach: { id: 'kitchen_approach', position: HOME_ZONES.kitchen.approachPosition },
  kitchen_stand: { id: 'kitchen_stand', position: HOME_ZONES.kitchen.anchorPosition },
  washroom_threshold_out: { id: 'washroom_threshold_out', position: [2.30, 0, 1.72] },
  washroom_threshold_in: { id: 'washroom_threshold_in', position: [3.62, 0.08, 1.72] },
  washroom_approach: { id: 'washroom_approach', position: HOME_ZONES.washroom.approachPosition },
  washroom_stand: { id: 'washroom_stand', position: HOME_ZONES.washroom.anchorPosition },
};

// Collision-free floor graph avoiding bed, study desk, dining table, console, shower & vanity
export const HOME_WAYPOINT_EDGES: Record<string, readonly string[]> = {
  study_seat: ['study_approach'],
  study_approach: ['study_seat', 'hall_west'],
  hall_west: ['study_approach', 'hall_center'],
  hall_center: ['hall_west', 'bed_approach', 'dining_approach', 'hall_east'],
  bed_approach: ['hall_center', 'bed_sleep'],
  bed_sleep: ['bed_approach'],
  dining_approach: ['hall_center', 'dining_back'],
  dining_back: ['dining_approach', 'dining_seat', 'hall_east'],
  dining_seat: ['dining_back'],
  hall_east: ['hall_center', 'dining_back', 'kitchen_approach', 'washroom_threshold_out'],
  kitchen_approach: ['hall_east', 'kitchen_stand'],
  kitchen_stand: ['kitchen_approach'],
  washroom_threshold_out: ['hall_east', 'washroom_threshold_in'],
  washroom_threshold_in: ['washroom_threshold_out', 'washroom_approach'],
  washroom_approach: ['washroom_threshold_in', 'washroom_stand'],
  washroom_stand: ['washroom_approach'],
};

const ZONE_FINAL_NODE: Record<HomeZoneId, string> = {
  study: 'study_seat',
  bedroom: 'bed_sleep',
  kitchen: 'kitchen_stand',
  dining: 'dining_seat',
  washroom: 'washroom_stand',
};

const ZONE_APPROACH_NODE: Record<HomeZoneId, string> = {
  study: 'study_approach',
  bedroom: 'bed_approach',
  kitchen: 'kitchen_approach',
  dining: 'dining_approach',
  washroom: 'washroom_stand',
};

function findNearestFloorNodeId(pos: [number, number, number]): string {
  let bestId = 'hall_center';
  let bestDist = Infinity;
  for (const node of Object.values(HOME_WAYPOINT_NODES)) {
    const dx = node.position[0] - pos[0];
    const dz = node.position[2] - pos[2];
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = node.id;
    }
  }
  return bestId;
}

/**
 * Resolves the effective zone anchor/approach/rotation for the active room theme.
 */
export function resolveHomeZoneConfig(
  zone: HomeZoneId,
  roomStyle: HomeRoomStyle = 'classic'
): HomeZoneConfig {
  const base = HOME_ZONES[zone];
  const override = getHomeRoomTheme(roomStyle).roomLayout?.zoneOverrides?.[zone];
  if (!override) return base;
  return {
    ...base,
    anchorPosition: override.anchorPosition,
    approachPosition: override.approachPosition,
    targetRotationY: override.targetRotationY,
  };
}

function segmentIntersectsBox(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;

  if (Math.abs(dx) < 1e-8) {
    if (x1 <= box.minX || x1 >= box.maxX) return false;
  } else {
    const invDx = 1 / dx;
    let t1 = (box.minX - x1) * invDx;
    let t2 = (box.maxX - x1) * invDx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin >= tMax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (z1 <= box.minZ || z1 >= box.maxZ) return false;
  } else {
    const invDz = 1 / dz;
    let t1 = (box.minZ - z1) * invDz;
    let t2 = (box.maxZ - z1) * invDz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin >= tMax) return false;
  }

  return tMin < tMax;
}

function isPointClearOfObstacles(
  x: number,
  z: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  obstacles: ReadonlyArray<{ minX: number; maxX: number; minZ: number; maxZ: number }>
): boolean {
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
  for (const box of obstacles) {
    if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) return false;
  }
  return true;
}

/**
 * Computes a collision-free floor path around room obstacle boxes for any room theme.
 */
export function computeObstacleAwareFloorPath(
  fromPos: [number, number, number],
  toPos: [number, number, number],
  roomStyle: HomeRoomStyle = 'classic'
): Array<[number, number, number]> {
  const layout = getHomeRoomTheme(roomStyle).roomLayout;
  const bounds = layout?.walkBounds || { minX: -3.65, maxX: 2.45, minZ: -2.75, maxZ: 2.45 };
  const obstacles = layout?.obstacles || [];

  const isSegmentClear = (ax: number, az: number, bx: number, bz: number) =>
    !obstacles.some((box) => segmentIntersectsBox(ax, az, bx, bz, box));

  if (obstacles.length === 0 || isSegmentClear(fromPos[0], fromPos[2], toPos[0], toPos[2])) {
    return [toPos];
  }

  const start: [number, number, number] = [fromPos[0], 0, fromPos[2]];
  const goal: [number, number, number] = [toPos[0], toPos[1], toPos[2]];
  const candidates: Array<[number, number, number]> = [start];

  const pad = 0.16;
  for (const box of obstacles) {
    const corners: Array<[number, number]> = [
      [box.minX - pad, box.minZ - pad],
      [box.maxX + pad, box.minZ - pad],
      [box.minX - pad, box.maxZ + pad],
      [box.maxX + pad, box.maxZ + pad],
    ];
    for (const [cx, cz] of corners) {
      if (isPointClearOfObstacles(cx, cz, bounds, obstacles)) {
        candidates.push([cx, 0, cz]);
      }
    }
  }
  if (isPointClearOfObstacles(0, 0, bounds, obstacles)) {
    candidates.push([0, 0, 0]);
  }
  candidates.push(goal);

  const n = candidates.length;
  const goalIdx = n - 1;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const visited = new Array<boolean>(n).fill(false);
  dist[0] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === goalIdx) break;
    visited[u] = true;

    for (let v = 0; v < n; v++) {
      if (visited[v] || u === v) continue;
      const ax = candidates[u][0];
      const az = candidates[u][2];
      const bx = candidates[v][0];
      const bz = candidates[v][2];
      if (!isSegmentClear(ax, az, bx, bz)) continue;
      const alt = dist[u] + Math.hypot(bx - ax, bz - az);
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (dist[goalIdx] === Infinity) {
    return [toPos];
  }

  const path: Array<[number, number, number]> = [];
  let curr = goalIdx;
  while (curr > 0) {
    path.unshift(candidates[curr]);
    curr = prev[curr];
  }
  return path.length > 0 ? path : [toPos];
}

/**
 * Deterministic BFS shortest path across room hallways avoiding walls & furniture collisions.
 */
export function computeHomeWaypointPath(
  fromPos: [number, number, number],
  toZone: HomeZoneId,
  options: { standingOnlyFallback?: boolean; roomStyle?: HomeRoomStyle } = {}
): Array<[number, number, number]> {
  const roomStyle = options.roomStyle || 'classic';
  if (roomStyle !== 'classic') {
    const zoneCfg = resolveHomeZoneConfig(toZone, roomStyle);
    const approachPath = computeObstacleAwareFloorPath(
      fromPos,
      zoneCfg.approachPosition,
      roomStyle
    );
    if (options.standingOnlyFallback && zoneCfg.supportsStaticStandingOnlyFallback) {
      return approachPath;
    }
    return [...approachPath, zoneCfg.anchorPosition];
  }

  const startNode = findNearestFloorNodeId(fromPos);
  const goalNode = options.standingOnlyFallback
    ? ZONE_APPROACH_NODE[toZone]
    : ZONE_FINAL_NODE[toZone];

  if (startNode === goalNode) {
    return [HOME_WAYPOINT_NODES[goalNode].position];
  }

  const queue: string[] = [startNode];
  const visited = new Set<string>([startNode]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === goalNode) break;
    const neighbors = HOME_WAYPOINT_EDGES[curr] || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        parent.set(next, curr);
        queue.push(next);
      }
    }
  }

  if (!visited.has(goalNode)) {
    return [HOME_WAYPOINT_NODES[goalNode].position];
  }

  const nodeIds: string[] = [];
  let cursor: string | undefined = goalNode;
  while (cursor) {
    nodeIds.unshift(cursor);
    if (cursor === startNode) break;
    cursor = parent.get(cursor);
  }

  // Skip startNode if character is already essentially standing there
  const firstPos = HOME_WAYPOINT_NODES[nodeIds[0]]?.position;
  if (firstPos && nodeIds.length > 1) {
    const distStart = Math.hypot(firstPos[0] - fromPos[0], firstPos[2] - fromPos[2]);
    if (distStart < 0.25) {
      nodeIds.shift();
    }
  }

  return nodeIds.map((id) => HOME_WAYPOINT_NODES[id].position);
}

export interface RoutineTimeBlockInput {
  id: string;
  date: string;
  title: string;
  startMinute: number;
  endMinute: number;
  category: string;
  completed?: boolean;
  deletedAt?: string | null;
}

export interface AutoRoutineInput {
  isRunning: boolean;
  timerEngine: TimerEngineMode;
  timerMode: TimerMode;
  currentHour: number;
  currentMinute?: number;
  habitCompletedRecently?: boolean;
  autoRoutine: boolean;
  manualZone: HomeZoneId;
  todayStr?: string;
  timeBlocks?: ReadonlyArray<RoutineTimeBlockInput>;
}

export interface DerivedHomeState {
  zone: HomeZoneId;
  activity: StudyAvatarActivity;
  poseMode: HomePoseMode;
  reason: string;
  isSleeping: boolean;
  isStudying: boolean;
  isOutOfRoom?: boolean;
  outReason?: string;
  activeBlockTitle?: string;
}

function formatMinuteOfDay(min: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function resolveActiveTimeBlock(
  timeBlocks: ReadonlyArray<RoutineTimeBlockInput> | undefined,
  currentTotalMinute: number,
  todayStr?: string
): RoutineTimeBlockInput | null {
  if (!timeBlocks || timeBlocks.length === 0) return null;
  for (const b of timeBlocks) {
    if (!b || b.deletedAt || b.completed) continue;
    if (todayStr && b.date !== todayStr) continue;
    if (currentTotalMinute >= b.startMinute && currentTotalMinute < b.endMinute) {
      return b;
    }
  }
  return null;
}

export function classifyTimeBlockState(block: RoutineTimeBlockInput): DerivedHomeState {
  const title = (block.title || '').trim() || block.category || 'Scheduled Block';
  const cat = (block.category || '').toLowerCase();
  const timeSpan = `${formatMinuteOfDay(block.startMinute)}–${formatMinuteOfDay(block.endMinute)}`;

  // 1. Class / Outside / Errand -> "Out for Class" placard near door
  if (
    /\b(class|lecture|college|school|university|lab|seminar|commute|outside|out|errand|shopping|market|gym|workout|jog|run|doctor|clinic|meeting|campus)\b/i.test(
      title
    )
  ) {
    return {
      zone: 'dining',
      activity: 'idle',
      poseMode: 'standing',
      reason: `Out (${timeSpan}) • ${title} (Back at ${formatMinuteOfDay(block.endMinute)})`,
      isSleeping: false,
      isStudying: false,
      isOutOfRoom: true,
      outReason: `${title} · Until ${formatMinuteOfDay(block.endMinute)}`,
      activeBlockTitle: title,
    };
  }

  // 2. Break / Meal / Coffee / Nap
  if (/\b(nap|sleep|rest|power\s*nap)\b/i.test(title)) {
    return {
      zone: 'bedroom',
      activity: 'sleeping',
      poseMode: 'sleeping',
      reason: `Schedule (${timeSpan}) • ${title}`,
      isSleeping: true,
      isStudying: false,
      activeBlockTitle: title,
    };
  }

  if (/\b(coffee|chai|tea|espresso|cafe)\b/i.test(title)) {
    return {
      zone: 'kitchen',
      activity: 'coffee',
      poseMode: 'standing',
      reason: `Schedule (${timeSpan}) • ${title}`,
      isSleeping: false,
      isStudying: false,
      activeBlockTitle: title,
    };
  }

  if (/\b(break|meal|lunch|dinner|breakfast|brunch|snack|eat|food)\b/i.test(title)) {
    return {
      zone: 'dining',
      activity: 'eating',
      poseMode: 'seated',
      reason: `Schedule (${timeSpan}) • ${title}`,
      isSleeping: false,
      isStudying: false,
      activeBlockTitle: title,
    };
  }

  // 3. Freshen up / shower
  if (/\b(shower|bath|freshen|morning\s*prep|skincare)\b/i.test(title)) {
    return {
      zone: 'washroom',
      activity: 'freshening_up',
      poseMode: 'standing',
      reason: `Schedule (${timeSpan}) • ${title}`,
      isSleeping: false,
      isStudying: false,
      activeBlockTitle: title,
    };
  }

  // 4. Deep Work / Focus / Learning / Work / Finance -> Study Desk
  if (
    cat === 'focus' ||
    cat === 'work' ||
    cat === 'learning' ||
    cat === 'finance' ||
    /\b(deep\s*work|study|revise|revision|exam|mock|code|coding|practice|solve|read|reading|writing|project|plan)\b/i.test(
      title
    )
  ) {
    const isReading = /\b(read|reading|revise|revision)\b/i.test(title);
    return {
      zone: 'study',
      activity: isReading ? 'reading' : 'typing',
      poseMode: 'seated',
      reason: `Schedule (${timeSpan}) • ${title}`,
      isSleeping: false,
      isStudying: true,
      activeBlockTitle: title,
    };
  }

  if (cat === 'health') {
    return {
      zone: 'washroom',
      activity: 'freshening_up',
      poseMode: 'standing',
      reason: `Health Block (${timeSpan}) • ${title}`,
      isSleeping: false,
      isStudying: false,
      activeBlockTitle: title,
    };
  }

  // Default planned block -> Dining relax/planning
  return {
    zone: 'dining',
    activity: 'coffee',
    poseMode: 'seated',
    reason: `Personal Block (${timeSpan}) • ${title}`,
    isSleeping: false,
    isStudying: false,
    activeBlockTitle: title,
  };
}

export function isMealWindowHour(hour: number): boolean {
  return hour === 8 || hour === 13 || hour === 20;
}

/**
 * 100% deterministic routine mapper wired into FocusFlow timer state, time-of-day,
 * meal windows, sleep window, and habit completions.
 */
export function deriveHomeRoutineState(input: AutoRoutineInput): DerivedHomeState {
  const {
    isRunning,
    timerEngine,
    timerMode,
    currentHour,
    currentMinute = 0,
    habitCompletedRecently = false,
    autoRoutine,
    manualZone,
  } = input;

  if (!autoRoutine) {
    const cfg = HOME_ZONES[manualZone];
    return {
      zone: cfg.id,
      activity: cfg.id === 'study' && isRunning ? 'typing' : cfg.activity,
      poseMode: cfg.poseMode,
      reason: `Manual • ${cfg.label}`,
      isSleeping: cfg.id === 'bedroom',
      isStudying: cfg.id === 'study',
    };
  }

  // 1. Live Break Check (Pomodoro short/long break)
  if (
    isRunning &&
    (timerEngine === 'short_break' ||
      timerEngine === 'long_break' ||
      timerMode === 'short_break' ||
      timerMode === 'long_break')
  ) {
    if (isMealWindowHour(currentHour)) {
      return {
        zone: 'dining',
        activity: 'eating',
        poseMode: 'seated',
        reason: 'Focus Break • Meal Time',
        isSleeping: false,
        isStudying: false,
      };
    }
    return {
      zone: 'kitchen',
      activity: 'coffee',
      poseMode: 'standing',
      reason: timerMode === 'long_break' || timerEngine === 'long_break' ? 'Long Break • Coffee Recharge' : 'Short Break • Coffee',
      isSleeping: false,
      isStudying: false,
    };
  }

  // 2. Live Focus Session (Pomodoro work OR Stopwatch / Countdown running)
  if (isRunning && (timerEngine === 'stopwatch' || timerEngine === 'countdown' || timerMode === 'work')) {
    return {
      zone: 'study',
      activity: 'typing',
      poseMode: 'seated',
      reason: timerEngine === 'stopwatch' ? 'Stopwatch Running' : 'Pomodoro Focus Session',
      isSleeping: false,
      isStudying: true,
    };
  }

  // 3. Habit Completion Celebration -> Washroom freshen-up
  if (habitCompletedRecently) {
    return {
      zone: 'washroom',
      activity: 'freshening_up',
      poseMode: 'standing',
      reason: 'Habit Completed • Freshening Up',
      isSleeping: false,
      isStudying: false,
    };
  }

  // 3b. Active Scheduled Time Block Sync (Deep Work / Break / Class Outside)
  const currentTotalMin = currentHour * 60 + currentMinute;
  const activeBlock = resolveActiveTimeBlock(input.timeBlocks, currentTotalMin, input.todayStr);
  if (activeBlock) {
    return classifyTimeBlockState(activeBlock);
  }

  // 4. Night / Sleep Schedule (11 PM – 6 AM)
  if (currentHour >= 23 || currentHour < 6) {
    return {
      zone: 'bedroom',
      activity: 'sleeping',
      poseMode: 'sleeping',
      reason: 'Night Routine (11 PM – 6 AM)',
      isSleeping: true,
      isStudying: false,
    };
  }

  // 5. Morning Freshen-Up (6 AM – 8 AM)
  if (currentHour >= 6 && currentHour < 8) {
    return {
      zone: 'washroom',
      activity: 'freshening_up',
      poseMode: 'standing',
      reason: 'Morning Routine (6 – 8 AM)',
      isSleeping: false,
      isStudying: false,
    };
  }

  // 6. Meal Windows (8–9 AM, 1–2 PM, 8–9 PM)
  if (isMealWindowHour(currentHour)) {
    if (currentHour === 8 && currentMinute < 30) {
      return {
        zone: 'kitchen',
        activity: 'coffee',
        poseMode: 'standing',
        reason: 'Breakfast Prep & Coffee (8 – 9 AM)',
        isSleeping: false,
        isStudying: false,
      };
    }
    const mealLabel =
      currentHour === 8 ? 'Breakfast (8 – 9 AM)' : currentHour === 13 ? 'Lunch Break (1 – 2 PM)' : 'Dinner (8 – 9 PM)';
    return {
      zone: 'dining',
      activity: 'eating',
      poseMode: 'seated',
      reason: mealLabel,
      isSleeping: false,
      isStudying: false,
    };
  }

  // 7. Evening unwind (9 PM – 11 PM): reading at study corner
  if (currentHour >= 21 && currentHour < 23) {
    return {
      zone: 'study',
      activity: 'reading',
      poseMode: 'seated',
      reason: 'Evening Reading',
      isSleeping: false,
      isStudying: true,
    };
  }

  // 8. Daytime Study / Workspace default
  return {
    zone: 'study',
    activity: 'studying',
    poseMode: 'seated',
    reason: 'Auto Routine • Study Desk',
    isSleeping: false,
    isStudying: true,
  };
}

export function deriveDefaultLightingForHour(hour: number): RoomLighting {
  if (hour >= 20 || hour < 6) return 'night';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'afternoon';
}

export function getZonedHourMinute(timezone?: string, date: Date = new Date()): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? date.getHours());
    const mRaw = Number(parts.find((p) => p.type === 'minute')?.value ?? date.getMinutes());
    return {
      hour: Number.isFinite(hRaw) ? hRaw % 24 : date.getHours(),
      minute: Number.isFinite(mRaw) ? mRaw % 60 : date.getMinutes(),
    };
  } catch {
    return { hour: date.getHours(), minute: date.getMinutes() };
  }
}

/**
 * Clamps free WASD / click-to-walk coordinates cleanly onto unobstructed floor
 * for the active room theme, preventing walking through walls or furniture.
 */
export function clampWalkableFloorPosition(
  x: number,
  z: number,
  roomStyle: HomeRoomStyle = 'classic'
): [number, number, number] {
  const layout = getHomeRoomTheme(roomStyle).roomLayout;
  const bounds = layout?.walkBounds || { minX: -3.65, maxX: 2.45, minZ: -2.75, maxZ: 2.45 };
  let cx = Math.max(bounds.minX, Math.min(bounds.maxX, x));
  let cz = Math.max(bounds.minZ, Math.min(bounds.maxZ, z));

  const obstacles = layout?.obstacles || [];
  for (const box of obstacles) {
    if (cx > box.minX && cx < box.maxX && cz > box.minZ && cz < box.maxZ) {
      if (box.pushAxis === 'z_front') {
        cz = box.maxZ;
        continue;
      }
      const dLeft = Math.abs(cx - box.minX);
      const dRight = Math.abs(box.maxX - cx);
      const dTop = Math.abs(cz - box.minZ);
      const dBot = Math.abs(box.maxZ - cz);
      const minD = Math.min(dLeft, dRight, dTop, dBot);
      if (minD === dLeft) cx = box.minX;
      else if (minD === dRight) cx = box.maxX;
      else if (minD === dTop) cz = box.minZ;
      else cz = box.maxZ;
    }
  }

  return [cx, 0, cz];
}
