import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

import {
  DREAM_GLOBE_CITIES,
  computeDreamGlobeProgress,
  computeMomentumWeatherOrbState,
  computeVinylRecordRack,
} from '../src/features/home/homeDreamAndArcade.ts';
import {
  REQUIRED_HUMANOID_BONES,
  applyHumanoidProceduralPose,
  inspectRigCapabilities,
} from '../src/features/study-room/humanoidRigController.ts';
import {
  HOME_ZONES,
  clampWalkableFloorPosition,
  computeHomeWaypointPath,
  deriveDefaultLightingForHour,
  deriveHomeRoutineState,
  type HomeZoneId,
} from '../src/features/home/homeRoutineEngine.ts';
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
  snapToHomeGrid,
} from '../src/features/home/homeShopAndLayout.ts';
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
  isHydrationOrCoffeeHabitTitle,
  selectCorkboardTasks,
  stepSimsNeeds,
  summarizeTodayHabits,
} from '../src/features/home/homeFeaturesEngine.ts';

function buildRigidHumanoidMock(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'anime-boy-01_Root';

  const makeNode = (name: string, y = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.y = y;
    return g;
  };

  const hips = makeNode('Hips', 0.52);
  const spine = makeNode('Spine', 0.14);
  const chest = makeNode('Chest', 0.18);
  const head = makeNode('Head', 0.25);
  const leftUpperArm = makeNode('LeftUpperArm', 0.13);
  const leftLowerArm = makeNode('LeftLowerArm', -0.22);
  const rightUpperArm = makeNode('RightUpperArm', 0.13);
  const rightLowerArm = makeNode('RightLowerArm', -0.22);
  const leftUpperLeg = makeNode('LeftUpperLeg', -0.02);
  const leftLowerLeg = makeNode('LeftLowerLeg', -0.26);
  const rightUpperLeg = makeNode('RightUpperLeg', -0.02);
  const rightLowerLeg = makeNode('RightLowerLeg', -0.26);

  leftUpperArm.add(leftLowerArm);
  rightUpperArm.add(rightLowerArm);
  leftUpperLeg.add(leftLowerLeg);
  rightUpperLeg.add(rightLowerLeg);
  chest.add(head, leftUpperArm, rightUpperArm);
  spine.add(chest);
  hips.add(spine, leftUpperLeg, rightUpperLeg);
  root.add(hips);
  return root;
}

function buildSkinnedHumanoidMock(): THREE.Group {
  const root = new THREE.Group();
  for (const name of REQUIRED_HUMANOID_BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    if (name === 'Hips') bone.position.y = 0.9;
    root.add(bone);
  }
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
  root.add(skinned);
  return root;
}

test('inspectRigCapabilities supports both Blender skinned skeletons and rigid-node anime hierarchies', () => {
  const skinned = buildSkinnedHumanoidMock();
  const skinnedCaps = inspectRigCapabilities(skinned);
  assert.equal(skinnedCaps.rigKind, 'skinned');
  assert.equal(skinnedCaps.isRigged, true);
  assert.equal(skinnedCaps.hasHumanoidSkeleton, true);
  assert.equal(skinnedCaps.restHipsY, 0.9);

  const rigid = buildRigidHumanoidMock();
  const rigidCaps = inspectRigCapabilities(rigid);
  assert.equal(rigidCaps.rigKind, 'rigid_node');
  assert.equal(rigidCaps.isRigged, true);
  assert.equal(rigidCaps.hasHumanoidSkeleton, true);
  assert.equal(rigidCaps.restHipsY, 0.52);
  assert.ok(rigidCaps.bones.upperArmL && rigidCaps.bones.upperLegL && rigidCaps.bones.lowerLegL);

  const staticGroup = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
  headMesh.name = 'Head';
  staticGroup.add(headMesh);
  const unriggedCaps = inspectRigCapabilities(staticGroup);
  assert.equal(unriggedCaps.rigKind, 'unrigged');
  assert.equal(unriggedCaps.isRigged, false);
  assert.equal(unriggedCaps.hasHumanoidSkeleton, false);
});

test('applyHumanoidProceduralPose supports walking, seated, sleeping, eating, coffee, and freshening_up across rigs without forcing static meshes', () => {
  for (const [label, model] of [
    ['skinned', buildSkinnedHumanoidMock()],
    ['rigid_node', buildRigidHumanoidMock()],
  ] as const) {
    const caps = inspectRigCapabilities(model);
    const group = new THREE.Group();

    // 1. Seated
    for (let i = 0; i < 6; i++) {
      applyHumanoidProceduralPose({
        modelGroup: group,
        basePositionY: 0,
        capabilities: caps,
        activity: 'typing',
        poseMode: 'seated',
        activeEmote: null,
        elapsedTime: 1.0 + i * 0.1,
        deltaSeconds: 0.2,
      });
    }
    assert.ok(caps.bones.upperLegL!.rotation.x < -0.9, `${label}: seated must flex upper leg forward`);
    assert.ok(caps.bones.lowerLegL!.rotation.x > 0.9, `${label}: seated must bend knee down`);
    assert.ok(caps.bones.hips!.position.y < caps.restHipsY, `${label}: seated drops hips proportionally`);

    // 2. Walking resets hips upright & swings legs
    for (let i = 0; i < 8; i++) {
      applyHumanoidProceduralPose({
        modelGroup: group,
        basePositionY: 0,
        capabilities: caps,
        activity: 'walking',
        poseMode: 'standing',
        activeEmote: null,
        elapsedTime: 0.22,
        deltaSeconds: 0.2,
      });
    }
    assert.ok(Math.abs(caps.bones.hips!.position.y - caps.restHipsY) < 0.05, `${label}: walking restores standing hips`);
    assert.ok(
      caps.bones.upperLegL!.rotation.x * caps.bones.upperLegR!.rotation.x < 0,
      `${label}: walking swings legs in opposite phase`
    );

    // 3. Sleeping pitches model horizontally (-PI/2) with straight legs
    for (let i = 0; i < 8; i++) {
      applyHumanoidProceduralPose({
        modelGroup: group,
        basePositionY: 0.54,
        capabilities: caps,
        activity: 'sleeping',
        poseMode: 'sleeping',
        activeEmote: null,
        elapsedTime: 1.0 + i * 0.2,
        deltaSeconds: 0.2,
      });
    }
    assert.ok(Math.abs(group.rotation.x + Math.PI / 2) < 0.08, `${label}: sleeping lies supine (-PI/2)`);
    assert.ok(Math.abs(caps.bones.upperLegL!.rotation.x) < 0.25, `${label}: sleeping relaxes legs`);

    // 4. Eating, coffee, and freshening_up return upright & animate arms
    for (const act of ['eating', 'coffee', 'freshening_up'] as const) {
      applyHumanoidProceduralPose({
        modelGroup: group,
        basePositionY: 0,
        capabilities: caps,
        activity: act,
        poseMode: act === 'eating' ? 'seated' : 'standing',
        activeEmote: null,
        elapsedTime: 1.2,
        deltaSeconds: 0.2,
      });
      assert.ok(caps.bones.upperArmR!.rotation.x < -0.1, `${label}: ${act} raises right arm naturally`);
    }
  }

  // Unrigged static mesh protects from sleeping rotation / forced joints
  const staticModel = new THREE.Group();
  const staticCaps = inspectRigCapabilities(staticModel);
  const staticGroup = new THREE.Group();
  applyHumanoidProceduralPose({
    modelGroup: staticGroup,
    basePositionY: 0,
    capabilities: staticCaps,
    activity: 'sleeping',
    poseMode: 'sleeping',
    activeEmote: null,
    elapsedTime: 1.0,
    deltaSeconds: 0.2,
  });
  assert.equal(staticGroup.rotation.x, 0, 'Unrigged mesh stays upright');
});

test('StudyAvatar invokes procedural pose controller for seated, sleeping, and walking states even when embedded clips exist', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/study-room/StudyAvatar.tsx'), 'utf8');
  assert.match(src, /poseMode === 'seated'/);
  assert.match(src, /poseMode === 'sleeping'/);
  assert.match(src, /activity === 'walking'/);
  assert.match(src, /enabled:\s*!forceProceduralPose/);
  assert.match(src, /if\s*\(animationName && !forceProceduralPose\)/);
  assert.match(src, /Zzz\.\.\./);
});

test('computeHomeWaypointPath routes cleanly between all 5 zones without clipping washroom partition wall', () => {
  const zones: HomeZoneId[] = ['study', 'bedroom', 'kitchen', 'dining', 'washroom'];
  for (const fromZone of zones) {
    for (const toZone of zones) {
      const pathPts = computeHomeWaypointPath(HOME_ZONES[fromZone].anchorPosition, toZone);
      assert.ok(pathPts.length >= 1, `Path must exist from ${fromZone} to ${toZone}`);
      const last = pathPts[pathPts.length - 1];
      assert.deepEqual(last, HOME_ZONES[toZone].anchorPosition);
    }
  }

  // Verify Study -> Washroom crosses through open doorway (x >= 2.3, z >= 1.4) rather than partition wall (z < 0.92)
  const studyToWashroom = computeHomeWaypointPath(HOME_ZONES.study.anchorPosition, 'washroom');
  assert.ok(
    studyToWashroom.some((p) => p[0] >= 2.2 && p[2] >= 1.2),
    'Path into washroom must use the open southern doorway (z >= 1.2)'
  );

  // Unrigged fallback stops at approach waypoint rather than overlapping chair/bed geometry
  const staticPath = computeHomeWaypointPath(HOME_ZONES.dining.anchorPosition, 'bedroom', {
    standingOnlyFallback: true,
  });
  assert.deepEqual(staticPath[staticPath.length - 1], HOME_ZONES.bedroom.approachPosition);
});

test('deriveHomeRoutineState maps Pomodoro, Stopwatch, breaks, meal windows, night sleep, and habit completion deterministically', () => {
  // 1. Pomodoro Work -> Study seated typing
  const pomoWork = deriveHomeRoutineState({
    isRunning: true,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 2, // Even late at night, live Pomodoro brings avatar to desk!
    autoRoutine: true,
    manualZone: 'bedroom',
  });
  assert.equal(pomoWork.zone, 'study');
  assert.equal(pomoWork.activity, 'typing');
  assert.equal(pomoWork.poseMode, 'seated');

  // 2. Stopwatch running -> Study
  const stopwatch = deriveHomeRoutineState({
    isRunning: true,
    timerEngine: 'stopwatch',
    timerMode: 'work',
    currentHour: 15,
    autoRoutine: true,
    manualZone: 'kitchen',
  });
  assert.equal(stopwatch.zone, 'study');
  assert.equal(stopwatch.activity, 'typing');

  // 3. Pomodoro Break -> Kitchen Coffee
  const pomoBreak = deriveHomeRoutineState({
    isRunning: true,
    timerEngine: 'pomodoro',
    timerMode: 'short_break',
    currentHour: 16,
    autoRoutine: true,
    manualZone: 'study',
  });
  assert.equal(pomoBreak.zone, 'kitchen');
  assert.equal(pomoBreak.activity, 'coffee');

  // 4. Night (11 PM - 6 AM) -> Bedroom Sleeping
  const nightSleep = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 1,
    autoRoutine: true,
    manualZone: 'study',
  });
  assert.equal(nightSleep.zone, 'bedroom');
  assert.equal(nightSleep.activity, 'sleeping');
  assert.equal(nightSleep.poseMode, 'sleeping');
  assert.equal(deriveDefaultLightingForHour(1), 'night');

  // 5. Meal Windows (8-9 AM, 1-2 PM, 8-9 PM)
  const lunch = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 13,
    currentMinute: 15,
    autoRoutine: true,
    manualZone: 'study',
  });
  assert.equal(lunch.zone, 'dining');
  assert.equal(lunch.activity, 'eating');

  // 6. Morning Freshen-Up (6-8 AM) & Habit Completion Trigger -> Washroom
  const morning = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 7,
    autoRoutine: true,
    manualZone: 'study',
  });
  assert.equal(morning.zone, 'washroom');
  assert.equal(morning.activity, 'freshening_up');

  const habitDone = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 15,
    habitCompletedRecently: true,
    autoRoutine: true,
    manualZone: 'study',
  });
  assert.equal(habitDone.zone, 'washroom');
  assert.equal(habitDone.activity, 'freshening_up');

  // 7. Manual Override
  const manual = deriveHomeRoutineState({
    isRunning: true,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 2,
    autoRoutine: false,
    manualZone: 'kitchen',
  });
  assert.equal(manual.zone, 'kitchen');
});

test('My Home module is wired as lazy-loaded my_home tab across App, Sidebar, AppContext, and SearchEngine', () => {
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const sidebarSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8');
  const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf8');
  const searchSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/searchEngine.tsx'), 'utf8');

  assert.match(appSrc, /lazyWithRetry\(\(\)\s*=>\s*import\(['"]\.\/components\/home\/MyHomeView\.tsx['"]\)/);
  assert.match(appSrc, /currentTab === 'my_home'/);
  assert.match(sidebarSrc, /id:\s*'my_home',\s*label:\s*'My Home'/);
  assert.match(ctxSrc, /'my_home'/);
  assert.match(searchSrc, /tab:\s*'my_home'/);
});

test('Dynamic clutter reacts deterministically to overdue tasks and unpaid bills', () => {
  const today = '2026-11-27';

  // Spotless desk when all tasks completed/future and all bills PAID
  const clean = computeRoomCleanliness({
    tasks: [
      { id: 't1', title: 'Done', status: 'completed', dueDate: '2026-11-25', priority: 'high' },
      { id: 't2', title: 'Next week', status: 'todo', dueDate: '2026-12-03', priority: 'low' },
    ],
    bills: [{ id: 'b1', name: 'Internet', status: 'PAID', dueDate: '2026-11-20', amountPaise: 99900 }],
    todayStr: today,
  });
  assert.equal(clean.clutterLevel, 0);
  assert.equal(clean.lampDimFactor, 1);
  assert.equal(clean.isNeatAndBright, true);
  assert.equal(clean.actionableTasks.length, 0);
  assert.equal(clean.actionableBills.length, 0);

  // Heavy clutter with overdue task + overdue/unpaid bills
  const cluttered = computeRoomCleanliness({
    tasks: [
      { id: 't1', title: 'Submit tax form', status: 'todo', dueDate: '2026-11-24', priority: 'high' },
      { id: 't2', title: 'Revise OS notes', status: 'in_progress', dueDate: today, priority: 'medium' },
      { id: 't3', title: 'Old task', status: 'todo', dueDate: '2026-11-20', priority: 'high' },
    ],
    bills: [
      { id: 'b1', name: 'Electricity', status: 'OVERDUE', dueDate: '2026-11-22', amountPaise: 185000 },
      { id: 'b2', name: 'Rent', status: 'UNPAID', dueDate: '2026-11-28', amountPaise: 1500000 },
      { id: 'b3', name: 'Water', status: 'UNPAID', dueDate: '2026-11-29', amountPaise: 40000 },
    ],
    todayStr: today,
  });
  assert.equal(cluttered.overdueTasksCount, 2);
  assert.equal(cluttered.dueTodayTasksCount, 1);
  assert.equal(cluttered.unpaidBillsCount, 3);
  assert.equal(cluttered.overdueBillsCount, 1);
  assert.equal(cluttered.clutterLevel, 3);
  assert.ok(cluttered.lampDimFactor < 0.6);
  assert.equal(cluttered.isNeatAndBright, false);
  assert.equal(cluttered.actionableTasks[0].isOverdue, true);
  assert.equal(cluttered.actionableBills[0].isOverdue, true);
});

test('Sims-style Needs bars drain during Pomodoro work and recharge during kitchen/sleep breaks', () => {
  const habitStats = summarizeTodayHabits(
    [
      { archived: false, completedDates: ['2026-11-27'], bestStreakDays: 10 },
      { archived: false, completedDates: ['2026-11-27'], bestStreakDays: 10 },
    ],
    '2026-11-27'
  );
  assert.equal(habitStats.completedHabitsToday, 2);
  assert.equal(habitStats.totalActiveHabits, 2);

  const init = computeInitialSimsNeeds({
    isRunning: true,
    timerMode: 'work',
    timerEngine: 'pomodoro',
    activeZone: 'study',
    activity: 'typing',
    isWalking: false,
    completedHabitsToday: 2,
    totalActiveHabits: 2,
    streakDays: 10,
    clutterLevel: 0,
    currentHour: 10,
  });
  assert.ok(init.energy >= 70 && init.mood >= 75);

  // Study work drains energy & sharpens focus
  let afterStudy = { ...init, energy: 70, focus: 55 };
  for (let i = 0; i < 20; i += 1) {
    afterStudy = stepSimsNeeds(
      afterStudy,
      {
        isRunning: true,
        timerMode: 'work',
        timerEngine: 'pomodoro',
        activeZone: 'study',
        activity: 'typing',
        isWalking: false,
        completedHabitsToday: 2,
        totalActiveHabits: 2,
        streakDays: 10,
        clutterLevel: 0,
        currentHour: 14,
      },
      1
    );
  }
  assert.ok(afterStudy.energy < 70, 'Energy should drain during sustained study');
  assert.ok(afterStudy.focus > 55, 'Focus should build during study');

  // Kitchen coffee break recharges energy and mood
  let afterBreak = { ...afterStudy };
  for (let i = 0; i < 15; i += 1) {
    afterBreak = stepSimsNeeds(
      afterBreak,
      {
        isRunning: true,
        timerMode: 'short_break',
        timerEngine: 'pomodoro',
        activeZone: 'kitchen',
        activity: 'coffee',
        isWalking: false,
        completedHabitsToday: 2,
        totalActiveHabits: 2,
        streakDays: 10,
        clutterLevel: 0,
        currentHour: 14,
      },
      1
    );
  }
  assert.ok(afterBreak.energy > afterStudy.energy, 'Coffee break should recharge energy');
});

test('XP & Savings-Milestone upgrades and Streak Pet accessories unlock deterministically', () => {
  const starter = computeHomeUnlocks({ totalXP: 100, savingsGoals: [], streakDays: 2 });
  assert.equal(starter.level, 1);
  assert.equal(starter.unlockedCount, 0);
  assert.equal(starter.pet.hasCollar, false);
  assert.equal(starter.pet.hasLuxuryPetBed, false);

  const midSavings = computeHomeUnlocks({
    totalXP: 250,
    savingsGoals: [{ targetPaise: 100000, savedPaise: 52000 }], // 52%
    streakDays: 8,
  });
  assert.equal(midSavings.unlocks.mechKeyboard, true);
  assert.equal(midSavings.unlocks.dualMonitor, true);
  assert.equal(midSavings.unlocks.extraPlants, true);
  assert.equal(midSavings.unlocks.fairyLights, true);
  assert.equal(midSavings.unlocks.espressoUpgrade, true);
  assert.equal(midSavings.unlocks.gamingChair, false);
  assert.equal(midSavings.pet.hasCollar, true);
  assert.equal(midSavings.pet.hasLuxuryPetBed, false);

  const maxMilestone = computeHomeUnlocks({
    totalXP: 150,
    savingsGoals: [{ targetPaise: 50000, savedPaise: 50000 }], // 100% goal achieved
    streakDays: 35,
  });
  assert.equal(maxMilestone.unlocks.gamingChair, true);
  assert.equal(maxMilestone.pet.hasCollar, true);
  assert.equal(maxMilestone.pet.hasLuxuryPetBed, true);
  assert.equal(maxMilestone.pet.tier, 'legendary');
});

test('Privacy-safe Visitor Home targets expose zero private finance data and wire interactive shortcuts cleanly', () => {
  const squadVisitor = buildVisitorHomeFromLeaderboardProfile(
    {
      uid: 'usr_friend_1',
      displayName: 'Aarav',
      avatarColor: '#38bdf8',
      isPublic: true,
      squadIds: ['sq_1'],
      todayKey: '2026-11-27',
      todayMinutes: 85,
      weekKey: '2026-W48',
      weekMinutes: 220,
      monthKey: '2026-11',
      monthMinutes: 640,
      dailyGoalMinutes: 120,
      totalSessionsCount: 18,
      streakDays: 14,
      updatedAt: new Date().toISOString(),
      isStudyingNow: true,
      studyActivity: 'studying',
      activeSubject: 'Algorithms',
    },
    { source: 'squad', sourceLabel: 'Squad · GATE 2027', isStudyingLive: true }
  );
  assert.equal(squadVisitor.displayName, 'Aarav');
  assert.equal(squadVisitor.isStudyingLive, true);
  assert.equal('amountPaise' in squadVisitor, false);
  assert.equal('savedPaise' in squadVisitor, false);

  const vaultVisitor = buildVisitorHomeFromVaultPartner({
    uid: 'usr_partner_2',
    name: 'Diya',
    vaultName: 'Apartment Fund',
    publicProfile: null,
  });
  assert.equal(vaultVisitor.source, 'joint_vault_partner');
  assert.equal(vaultVisitor.estimatedXP, 0);
  assert.equal('email' in vaultVisitor, false);

  const aptSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeApartment.tsx'), 'utf8');
  const viewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeView.tsx'), 'utf8');
  assert.match(aptSrc, /StudyDeskClutter/);
  assert.match(aptSrc, /MyHomeUnlockedDecor/);
  assert.match(aptSrc, /MyHomeWindowRain/);
  for (const id of ['laptop', 'bookshelf', 'kitchen_dining', 'wall_schedule', 'window_speaker']) {
    assert.ok(aptSrc.includes(`'${id}'`), `MyHomeApartment missing furniture shortcut ${id}`);
  }
  assert.match(viewSrc, /MyHomePet/);
  assert.match(viewSrc, /WallSchedulePopup/);
  assert.match(viewSrc, /KitchenDiningPopup/);
  assert.match(viewSrc, /UpgradesAndPetModal/);
  assert.match(viewSrc, /VisitHomeModal/);
});

test('Batch 2: Corkboard sticky tasks, Exam countdown, Time-Block sync, End-Day/Morning sequence, Desk POV & Seasons', () => {
  const today = '2026-11-27';

  // 1. Corkboard real top 4 tasks
  const stickyNotes = selectCorkboardTasks(
    [
      { id: '1', title: 'Low priority chore', status: 'todo', priority: 'low', dueDate: '2026-11-29' },
      { id: '2', title: 'Completed item', status: 'completed', priority: 'high', dueDate: '2026-11-25' },
      { id: '3', title: 'Overdue Tax Filing', status: 'todo', priority: 'medium', dueDate: '2026-11-24' },
      { id: '4', title: 'DBMS Indexing Mock', status: 'in_progress', priority: 'high', dueDate: today },
      { id: '5', title: 'Fix Auth Bug', status: 'todo', priority: 'high', dueDate: '2026-11-28' },
      { id: '6', title: 'Revise OS Deadlocks', status: 'todo', priority: 'medium', dueDate: today },
    ],
    today,
    4
  );
  assert.equal(stickyNotes.length, 4);
  assert.equal(stickyNotes[0].id, '3'); // Overdue ranked first
  assert.equal(stickyNotes[0].isOverdue, true);
  assert.equal(stickyNotes[1].id, '4'); // High priority next

  // 2. Exam Countdown & Exam Week
  const examSum = computeExamAndTargetSummary({
    exams: [
      {
        id: 'ex_1',
        title: 'Sem 3 Endterm',
        examDate: '2026-12-02',
        examType: 'endterm',
        deletedAt: null,
      },
    ],
    todayStr: today,
    todayFocusMinutes: 90,
    dailyGoalMinutes: 120,
  });
  assert.equal(examSum.hasExam, true);
  assert.equal(examSum.daysLeft, 5);
  assert.equal(examSum.isExamWeek, true);
  assert.equal(examSum.dailyTargetPct, 75);

  // 3. Time-Block Routine Sync (Deep Work / Meal / Out for Class)
  const blocks = [
    { id: 'tb1', date: today, title: 'Deep Work - Compilers', startMinute: 9 * 60, endMinute: 11 * 60, category: 'Focus' },
    { id: 'tb2', date: today, title: 'OS Lecture Class', startMinute: 11 * 60, endMinute: 13 * 60, category: 'Learning' },
    { id: 'tb3', date: today, title: 'Lunch Break', startMinute: 14 * 60, endMinute: 15 * 60, category: 'Personal' },
  ];
  const deepWork = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 9,
    currentMinute: 30,
    autoRoutine: true,
    manualZone: 'bedroom',
    todayStr: today,
    timeBlocks: blocks,
  });
  assert.equal(deepWork.zone, 'study');
  assert.equal(deepWork.isStudying, true);

  const outClass = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 11,
    currentMinute: 15,
    autoRoutine: true,
    manualZone: 'study',
    todayStr: today,
    timeBlocks: blocks,
  });
  assert.equal(outClass.isOutOfRoom, true);
  assert.match(outClass.reason, /OS Lecture Class/);

  const lunchBlock = deriveHomeRoutineState({
    isRunning: false,
    timerEngine: 'pomodoro',
    timerMode: 'work',
    currentHour: 14,
    currentMinute: 10,
    autoRoutine: true,
    manualZone: 'study',
    todayStr: today,
    timeBlocks: blocks,
  });
  assert.equal(lunchBlock.zone, 'dining');
  assert.equal(lunchBlock.activity, 'eating');

  // 4. Daily Wrap-Up & Morning Sequence
  const wrap = computeDailyWrapUpStats({
    sessions: [
      { mode: 'work', startedAt: '2026-11-27T09:00:00+05:30', actualDurationSeconds: 1800, durationSeconds: 1800, completed: true },
    ],
    expenses: [{ amountPaise: 25000, date: today, deletedAt: null }],
    habits: [{ archived: false, deletedAt: null, completedDates: [today], bestStreakDays: 5 }],
    tasks: [{ status: 'completed', completedAt: '2026-11-27T10:30:00+05:30', deletedAt: null }],
    todayStr: today,
    timezone: 'Asia/Kolkata',
  });
  assert.equal(wrap.focusMinutesToday, 30);
  assert.equal(wrap.spentPaiseToday, 25000);
  assert.equal(wrap.habitsDoneToday, 1);
  assert.equal(wrap.tasksCompletedToday, 1);

  assert.equal(getMorningSequenceStep(1.0)?.zone, 'bedroom');
  assert.equal(getMorningSequenceStep(3.5)?.zone, 'washroom');
  assert.equal(getMorningSequenceStep(6.0)?.zone, 'kitchen');
  assert.equal(getMorningSequenceStep(9.0)?.zone, 'study');
  assert.equal(getMorningSequenceStep(MORNING_SEQUENCE_TOTAL_SECONDS), null);

  // 5. Calendar Seasons & Special Days (Monsoon / Winter / Exam Week / Birthday)
  const monsoonBday = computeCalendarSeasonState({
    todayStr: '2026-07-14',
    birthDate: '2003-07-14',
    isExamWeek: true,
  });
  assert.equal(monsoonBday.season, 'monsoon');
  assert.equal(monsoonBday.showRainWindow, true);
  assert.equal(monsoonBday.showHotTeaMug, true);
  assert.equal(monsoonBday.isBirthdayToday, true);
  assert.equal(monsoonBday.showExamWeekBooks, true);

  const winter = computeCalendarSeasonState({
    todayStr: '2026-12-20',
    birthDate: '2003-07-14',
    isExamWeek: false,
  });
  assert.equal(winter.season, 'winter');
  assert.equal(winter.forceFairyLights, true);
  assert.equal(winter.showSnowWindow, true);
  assert.equal(winter.isBirthdayToday, false);
});

test('Batch 3 & Batch 4: Living plants, Vault safe, Parcels/Mail, Whiteboard, Flow State, Tax Jar, Bookshelf, Time Capsule, Hydration & Expansion', () => {
  const today = '2026-11-27';

  // Living Plants (blooming at 30d, wilted if >=3d missed)
  const blooming = computeLivingPlantState({
    streakDays: 32,
    habits: [{ archived: false, deletedAt: null, completedDates: [today] }],
    todayStr: today,
  });
  assert.equal(blooming.stage, 'blooming');

  const wilted = computeLivingPlantState({
    streakDays: 0,
    habits: [{ archived: false, deletedAt: null, completedDates: ['2026-11-22'] }],
    todayStr: today,
  });
  assert.equal(wilted.stage, 'wilted');

  // Vault Safe Bronze -> Silver -> Gold
  assert.equal(computeVaultSafeState(25).tier, 'bronze');
  assert.equal(computeVaultSafeState(55).tier, 'silver');
  assert.equal(computeVaultSafeState(100).tier, 'gold');

  // Doorstep Parcels & Red-Ribbon Bill Mail
  const deliveries = computeDoorstepDeliveries({
    expenses: [
      { id: 'e1', description: 'Mechanical Keyboard Amazon', categoryName: 'Shopping & Gadgets', amountPaise: 420000, date: '2026-11-25', deletedAt: null },
    ],
    bills: [
      { id: 'b1', name: 'Fiber Wi-Fi', status: 'UNPAID', dueDate: '2026-11-29', amountPaise: 99900, deletedAt: null },
    ],
    todayStr: today,
  });
  assert.equal(deliveries.hasParcel, true);
  assert.equal(deliveries.hasMail, true);

  // Flow State Golden Aura (25+ min zero pause) + 4-Cycle Lantern
  const flow = computeFlowStateStatus({
    isRunning: true,
    timerMode: 'work',
    timerEngine: 'pomodoro',
    totalDuration: 3000,
    timeLeft: 1400, // 1600s = 26m+ elapsed
    stopwatchElapsed: 0,
    wasPausedThisRun: false,
    sessions: [
      { mode: 'work', startedAt: '2026-11-27T08:00:00+05:30', completed: true },
      { mode: 'work', startedAt: '2026-11-27T09:00:00+05:30', completed: true },
      { mode: 'work', startedAt: '2026-11-27T10:00:00+05:30', completed: true },
      { mode: 'work', startedAt: '2026-11-27T11:00:00+05:30', completed: true },
    ],
    todayStr: today,
    timezone: 'Asia/Kolkata',
  });
  assert.equal(flow.isFlowStateActive, true);
  assert.equal(flow.hasFourCycleLantern, true);

  // Doomscroll Tax Jar
  const jar = computeDoomscrollJarState([
    {
      id: 'd1',
      userId: 'u1',
      minutes: 45,
      distractionApp: 'Instagram',
      ratePerHour: 200,
      amountTaxed: 150,
      currency: 'INR',
      createdAt: today,
    },
  ]);
  assert.equal(jar.totalTaxAmount, 150);
  assert.equal(jar.coinCount, 6);
  assert.equal(jar.isEmpty, false);

  // Living Bookshelf subject color sync
  const shelf = computeLivingBookshelfState({
    subjects: [
      { code: 'OS', color: '#ec4899', totalSubtopics: 10, completedSubtopics: 3, deletedAt: null },
    ],
    topics: [
      { subjectCode: 'OS', theory: true, practice: true, pyq: false, deletedAt: null },
      { subjectCode: 'OS', theory: true, practice: false, pyq: false, deletedAt: null },
    ],
  });
  assert.equal(shelf.completedTopicCount, 1);
  assert.equal(shelf.books[0].color, '#ec4899');

  // Time Capsule Chest
  const capsuleState = computeTimeCapsuleChestState({
    capsules: [
      {
        id: 'tc1',
        userId: 'u1',
        title: 'Open After Finals',
        content: 'Congrats!',
        createdAt: '2026-06-01',
        unlockDate: '2026-11-26',
        isUnlocked: false,
      },
    ],
    todayStr: today,
  });
  assert.equal(capsuleState.shouldGlow, true);
  assert.equal(capsuleState.readyCount, 1);

  // Hydration Habit Sync
  assert.equal(isHydrationOrCoffeeHabitTitle('Drink 3L Water'), 'hydration');
  assert.equal(isHydrationOrCoffeeHabitTitle('Morning Matcha Tea'), 'coffee');
  const hydro = computeHydrationHabitState({
    habits: [{ title: 'Drink 2L Water', category: 'Health', archived: false, deletedAt: null, completedDates: [today] }],
    todayStr: today,
  });
  assert.equal(hydro.hydratedToday, true);
  assert.equal(hydro.waterFillRatio, 1);

  // Apartment Expansion Tiers
  assert.equal(computeApartmentExpansion({ level: 4 }).tier, 'studio');
  assert.equal(computeApartmentExpansion({ level: 10 }).hasBalcony, true);
  assert.equal(computeApartmentExpansion({ level: 22 }).hasPenthouse, true);

  // Component Wiring Check
  const viewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeView.tsx'), 'utf8');
  const rigSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/study-room/RoomCameraRig.tsx'), 'utf8');
  assert.match(rigSrc, /desk_pov/);
  assert.match(viewSrc, /preserveDrawingBuffer:\s*true/);
  assert.match(viewSrc, /EndDaySleepModal/);
  assert.match(viewSrc, /DoorstepParcelMailModal/);
  assert.match(viewSrc, /DoomscrollJarModal/);
  assert.match(viewSrc, /TimeCapsuleQuickModal/);
});

test('Click-to-walk bounds, 3D Furniture Shop + 0.5m Grid Layout, Sky Arc & Smart Wall TV metrics', () => {
  // 1. Walkable floor clamping avoids bed & dining table
  const clampedBed = clampWalkableFloorPosition(-2.1, -2.2);
  assert.ok(clampedBed[2] >= -1.12, 'Should clamp avatar outside bed footprint');
  const clampedTable = clampWalkableFloorPosition(-0.15, 0.95);
  assert.ok(
    clampedTable[0] <= -0.78 || clampedTable[0] >= 0.48 || clampedTable[2] <= 0.32 || clampedTable[2] >= 1.58,
    'Should clamp avatar outside dining table footprint'
  );

  // 2. Focus Coins + Furniture Shop purchase, 0.5m grid snap, rotate & remove
  const coins = computeFocusCoinsBalance({ totalXP: 500, completedWorkCyclesToday: 2, spentCoins: 0 });
  assert.equal(coins, 230);

  const buy1 = purchaseShopItem(DEFAULT_HOME_SHOP_STATE, 'fish_aquarium', coins);
  assert.equal(buy1.success, true);
  assert.equal(buy1.nextState.ownedIds.includes('fish_aquarium'), true);
  assert.equal(buy1.nextState.spentCoins, 80);

  const snapped = snapToHomeGrid(1.23, 0.74, 0.5);
  assert.equal(snapped.x, 1);
  assert.equal(snapped.z, 0.5);

  const moved = placeOrMoveShopItem(buy1.nextState, 'fish_aquarium', 1.23, 0.74);
  assert.equal(moved.placedItems[0].x, 1);
  assert.equal(moved.placedItems[0].z, 0.5);

  const rotated = rotatePlacedShopItem(moved, 'fish_aquarium');
  assert.ok(Math.abs(rotated.placedItems[0].rotationY - Math.PI / 2) < 0.001);

  const removed = removePlacedShopItem(rotated, 'fish_aquarium');
  assert.equal(removed.placedItems.length, 0);

  // 3. Monthly Budget & 14-day Streak Heatmap for Smart Wall TV
  const budget = computeMonthlyBudgetSummary({
    expenses: [
      { amountPaise: 350000, date: '2026-11-10', deletedAt: null },
      { amountPaise: 150000, date: '2026-10-20', deletedAt: null },
    ],
    monthlyBudgetPaise: 1000000,
    todayStr: '2026-11-27',
  });
  assert.equal(budget.spentPaiseThisMonth, 350000);
  assert.equal(budget.budgetPct, 35);

  const heatmap = computeStreakHeatmapDays({
    sessions: [{ mode: 'work', startedAt: '2026-11-27T09:00:00+05:30', completed: true }],
    habits: [{ archived: false, deletedAt: null, completedDates: ['2026-11-27', '2026-11-26'] }],
    todayStr: '2026-11-27',
    timezone: 'Asia/Kolkata',
    daysCount: 14,
  });
  assert.equal(heatmap.length, 14);
  assert.ok(heatmap[13].level >= 1);

  // 4. Sun/Moon sky arc
  const noonSky = computeSunMoonSkyPosition(12, 30, false);
  assert.equal(noonSky.isNight, false);
  const nightSky = computeSunMoonSkyPosition(22, 0, true);
  assert.equal(nightSky.isNight, true);

  // 5. Wiring check in MyHomeView
  const viewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeView.tsx'), 'utf8');
  assert.match(viewSrc, /FurnitureShopModal/);
  assert.match(viewSrc, /coStudyGuests/);
  assert.match(viewSrc, /smartTvData/);
  assert.match(viewSrc, /breathingSecondsLeft/);
});

test('Focus Desk Aquarium, Constellation Observatory, Coin Physics Jar, Audio Speakers, Desk Toys & Custom Wall Frames', () => {
  const today = '2026-11-27';

  // 1. Focus Desk Aquarium: misty when 0 streak & 0 today sessions, crystal clear + jellyfish at 6+
  const mistyTank = computeFocusAquariumState({
    sessions: [],
    streakDays: 0,
    todayStr: today,
    timezone: 'Asia/Kolkata',
  });
  assert.equal(mistyTank.isMisty, true);
  assert.equal(mistyTank.fishCount, 0);
  assert.equal(mistyTank.hasJellyfish, false);

  const richTank = computeFocusAquariumState({
    sessions: Array.from({ length: 7 }, (_, i) => ({
      mode: 'work',
      startedAt: i === 0 ? `${today}T09:00:00+05:30` : '2026-11-26T10:00:00+05:30',
      completed: true,
    })),
    streakDays: 4,
    todayStr: today,
    timezone: 'Asia/Kolkata',
  });
  assert.equal(richTank.isMisty, false);
  assert.equal(richTank.hasCoral, true);
  assert.equal(richTank.fishCount, 4);
  assert.equal(richTank.hasJellyfish, true);

  // 2. Constellation Observatory stars
  const stars = computeConstellationStars({
    subjects: [{ code: 'DBMS', color: '#38bdf8', deletedAt: null }],
    topics: [{ id: 't1', topic: 'B+ Trees', subjectCode: 'DBMS', theory: true, practice: true, pyq: false, deletedAt: null }],
    skillNodes: [{ id: 'sk1', title: 'Dynamic Programming', status: 'completed' }],
  });
  assert.ok(stars.some((s) => s.kind === 'study' && s.label === 'B+ Trees'));
  assert.ok(stars.some((s) => s.kind === 'skill' && s.label === 'Dynamic Programming'));

  // 3. Default custom frames & component wiring
  assert.equal(DEFAULT_CUSTOM_FRAMES.length, 2);

  const aptSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeApartment.tsx'), 'utf8');
  const viewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeView.tsx'), 'utf8');
  const rigSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/study-room/RoomCameraRig.tsx'), 'utf8');
  assert.match(aptSrc, /FocusDeskAquariumProp/);
  assert.match(aptSrc, /ConstellationSkyDomeProp/);
  assert.match(aptSrc, /SavingsCoinDropPhysicsJarProp/);
  assert.match(aptSrc, /AudioReactiveSpeakersAndEqProp/);
  assert.match(aptSrc, /BreakTimeInteractiveDeskToysProp/);
  assert.match(aptSrc, /CustomWallPhotoFrameProp/);
  assert.match(rigSrc, /observatory/);
  assert.match(viewSrc, /CustomWallFramesModal/);
});

test('Retro Arcade, Paper Airplane, Sit-Stand Desk, Dream Globe, Vinyl Rack & Weather Orb', () => {
  // 1. Vinyl Record Rack progressive unlocks
  const starterRack = computeVinylRecordRack(0);
  assert.equal(starterRack.length, 4);
  assert.equal(starterRack[0].unlocked, true);
  assert.equal(starterRack[1].unlocked, false);

  const fullRack = computeVinylRecordRack(10);
  assert.ok(fullRack.every((s) => s.unlocked));

  // 2. Momentum Weather Orb states
  assert.equal(
    computeMomentumWeatherOrbState({ todayFocusMinutes: 0, isFlowStateActive: false, isRunning: false }).mood,
    'calm_clouds'
  );
  assert.equal(
    computeMomentumWeatherOrbState({ todayFocusMinutes: 25, isFlowStateActive: false, isRunning: true }).mood,
    'golden_sun'
  );
  assert.equal(
    computeMomentumWeatherOrbState({ todayFocusMinutes: 65, isFlowStateActive: true, isRunning: true }).mood,
    'electric_storm'
  );

  // 3. Dream Globe destinations & progress clamping
  assert.ok(DREAM_GLOBE_CITIES.length >= 4);
  assert.equal(computeDreamGlobeProgress(-10), 0.05);
  assert.equal(computeDreamGlobeProgress(48), 0.48);
  assert.equal(computeDreamGlobeProgress(150), 1);

  // 4. Component & Modal wiring in MyHomeApartment and MyHomeView
  const aptSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeApartment.tsx'), 'utf8');
  const viewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/home/MyHomeView.tsx'), 'utf8');
  assert.match(aptSrc, /RetroArcadeCabinetProp/);
  assert.match(aptSrc, /PaperAirplaneDeliveryProp/);
  assert.match(aptSrc, /DreamGlobeProp/);
  assert.match(aptSrc, /VinylRecordRackProp/);
  assert.match(aptSrc, /MomentumWeatherOrbProp/);
  assert.match(aptSrc, /standing_desk_switch/);
  assert.match(aptSrc, /isStandingDesk/);
  assert.match(viewSrc, /ArcadeMiniGameModal/);
  assert.match(viewSrc, /PaperAirplaneInboxModal/);
  assert.match(viewSrc, /DreamGlobeModal/);
  assert.match(viewSrc, /isStandingDesk/);
});

