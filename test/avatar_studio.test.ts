import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  AVATAR_CATALOG,
  DEFAULT_AVATAR_ID,
  getAvatarCatalogEntry,
  validateAndSanitizeAvatarConfig,
} from '../src/features/avatar/avatar-catalog.ts';
import { resolveStudyAvatarIdentity } from '../src/lib/studyAvatarRegistry.ts';
import { rankLeaderboardProfiles } from '../src/lib/leaderboardService.ts';
import * as THREE from 'three';
import {
  REQUIRED_HUMANOID_BONES,
  applyHumanoidProceduralPose,
  inspectRigCapabilities,
} from '../src/features/study-room/humanoidRigController.ts';
import {
  applyAvatarMaterialCustomization,
  disposeClonedAvatarMaterials,
} from '../src/features/avatar/avatarMaterialService.ts';

test('AVATAR_CATALOG provides multiple male & female GLB avatars with no hardcoded user names', () => {
  assert.ok(AVATAR_CATALOG.length >= 4, 'Catalog must include at least 4 avatars');
  const styles = new Set(AVATAR_CATALOG.map((a) => a.style));
  assert.ok(styles.has('male') && styles.has('female'), 'Must include both male and female styles');

  for (const entry of AVATAR_CATALOG) {
    assert.equal(entry.modelFormat, 'glb');
    assert.equal(entry.available, true);
    assert.ok(entry.modelUrl.startsWith('/models/avatars/') && entry.modelUrl.endsWith('.glb'));
    const diskPath = path.join(process.cwd(), 'public', entry.modelUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `GLB asset missing on disk: ${diskPath}`);
    assert.ok(!/atif|puja/i.test(entry.displayName), 'No hardcoded personal names in catalog');
  }
});

test('validateAndSanitizeAvatarConfig rejects spoofed modelUrl and unsupported values', () => {
  const spoofed = validateAndSanitizeAvatarConfig({
    avatarId: 'anime-boy-02',
    modelUrl: 'https://evil.example.com/malicious.glb',
    customization: {
      hairColor: '#78350f',
      eyeColor: '#NOT_A_HEX',
      outfitColor: '#0f766e',
      accessories: ['glasses', 'jetpack', 'headphones'],
    },
  });

  const expectedEntry = getAvatarCatalogEntry('anime-boy-02');
  assert.equal(spoofed.avatarId, 'anime-boy-02');
  assert.equal(spoofed.modelUrl, expectedEntry.modelUrl, 'Spoofed modelUrl must be overwritten');
  assert.equal(spoofed.customization.hairColor, '#78350f');
  assert.equal(spoofed.customization.eyeColor, expectedEntry.defaults.eyeColor);
  assert.equal(spoofed.customization.outfitColor, '#0f766e');
  assert.deepEqual(spoofed.customization.accessories, ['glasses', 'headphones']);

  const unknownAvatar = validateAndSanitizeAvatarConfig({
    avatarId: 'non-existent-character',
    modelUrl: '/etc/passwd',
  });
  assert.equal(unknownAvatar.avatarId, DEFAULT_AVATAR_ID);
  assert.equal(unknownAvatar.modelUrl, getAvatarCatalogEntry(DEFAULT_AVATAR_ID).modelUrl);
});

test('Multi-user avatar isolation: 3 distinct users get independent 3D avatars and customizations', () => {
  const userA = {
    uid: 'uid-alice-001',
    displayName: 'Alice',
    avatarColor: '#4f46e5',
    avatarConfig: validateAndSanitizeAvatarConfig({
      avatarId: 'avatar-01',
      customization: {
        hairColor: AVATAR_CATALOG.find((a) => a.id === 'avatar-01')!.supportedCustomization.hairColors[1],
        eyeColor: AVATAR_CATALOG.find((a) => a.id === 'avatar-01')!.supportedCustomization.eyeColors[2],
        outfitColor: AVATAR_CATALOG.find((a) => a.id === 'avatar-01')!.supportedCustomization.outfitColors[0],
        accessories: ['glasses'],
      },
    }),
  };

  const userB = {
    uid: 'uid-bob-002',
    displayName: 'Bob',
    avatarColor: '#0f766e',
    avatarConfig: validateAndSanitizeAvatarConfig({
      avatarId: 'avatar-02',
      customization: {
        hairColor: AVATAR_CATALOG.find((a) => a.id === 'avatar-02')!.supportedCustomization.hairColors[3],
        eyeColor: AVATAR_CATALOG.find((a) => a.id === 'avatar-02')!.supportedCustomization.eyeColors[1],
        outfitColor: AVATAR_CATALOG.find((a) => a.id === 'avatar-02')!.supportedCustomization.outfitColors[2],
        accessories: ['headphones'],
      },
    }),
  };

  const userC = {
    uid: 'uid-charlie-003',
    displayName: 'Charlie',
    avatarColor: '#db2777',
    avatarConfig: null, // New user who has not customized yet
  };

  const idA = resolveStudyAvatarIdentity(userA);
  const idB = resolveStudyAvatarIdentity(userB);
  const idC = resolveStudyAvatarIdentity(userC);

  assert.equal(idA.id, 'avatar-01');
  assert.equal(idA.modelUrl, '/models/avatars/avatar-01.glb');
  assert.deepEqual(idA.accessories, ['glasses']);

  assert.equal(idB.id, 'avatar-02');
  assert.equal(idB.modelUrl, '/models/avatars/avatar-02.glb');
  assert.deepEqual(idB.accessories, ['headphones']);

  assert.ok(AVATAR_CATALOG.some((c) => c.id === idC.id), 'Fallback user must resolve to a valid catalog avatar');
  assert.notEqual(idA.hairColor, idB.hairColor);
  assert.notEqual(idA.modelUrl, idB.modelUrl);
});

test('rankLeaderboardProfiles preserves avatarConfig for squad rendering', () => {
  const cfg = validateAndSanitizeAvatarConfig({
    avatarId: 'anime-girl-02',
    customization: { accessories: ['glasses', 'headphones'] },
  });

  const ranked = rankLeaderboardProfiles({
    profiles: [
      {
        uid: 'u-1',
        displayName: 'Student One',
        avatarColor: '#4f46e5',
        avatarConfig: cfg,
        isPublic: true,
        squadIds: [],
        todayKey: '2026-11-26',
        todayMinutes: 60,
        weekKey: '2026-W48',
        weekMinutes: 180,
        monthKey: '2026-11',
        monthMinutes: 180,
        streakDays: 5,
        dailyGoalMinutes: 120,
        totalSessionsCount: 4,
        updatedAt: new Date().toISOString(),
      },
    ],
    period: 'week',
    currentUid: 'u-1',
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].avatarConfig?.avatarId, 'anime-girl-02');
  assert.deepEqual(ranked[0].avatarConfig?.customization?.accessories, ['glasses', 'headphones']);
});

test('Catalog rig metadata accurately distinguishes rigged avatar-01 from unrigged avatar-02', () => {
  const a1 = getAvatarCatalogEntry('avatar-01');
  assert.equal(a1.isRigged, true);
  assert.equal(a1.hasHumanoidSkeleton, true);
  assert.equal(a1.animationSupport, 'procedural_skeletal');
  assert.deepEqual(a1.supportedPoses, ['standing', 'seated']);
  assert.equal(a1.rigStatus, 'rigged_21_bones_procedural');

  const a2 = getAvatarCatalogEntry('avatar-02');
  assert.equal(a2.isRigged, false);
  assert.equal(a2.hasHumanoidSkeleton, false);
  assert.equal(a2.animationSupport, 'whole_model_only');
  assert.deepEqual(a2.supportedPoses, ['standing']);
  assert.equal(a2.rigStatus, 'unrigged_static');
});

test('GLB binary rig inspection confirms avatar-01 has all required humanoid bones and avatar-02 is unrigged', () => {
  const parseGlbJson = (relPath: string) => {
    const buf = fs.readFileSync(path.join(process.cwd(), relPath));
    const jsonLen = buf.readUInt32LE(12);
    return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  };

  const gltf1 = parseGlbJson('public/models/avatars/avatar-01.glb');
  assert.equal((gltf1.skins || []).length, 1);
  const jointNames = new Set((gltf1.skins[0].joints || []).map((j: number) => gltf1.nodes[j]?.name));
  for (const reqBone of REQUIRED_HUMANOID_BONES) {
    assert.ok(jointNames.has(reqBone), `avatar-01.glb missing required humanoid bone: ${reqBone}`);
  }

  const gltf2 = parseGlbJson('public/models/avatars/avatar-02.glb');
  assert.equal((gltf2.skins || []).length, 0, 'avatar-02.glb must accurately report 0 skins');
});

test('Reusable humanoidRigController animates rigged skeletons and protects unrigged meshes from forced poses', () => {
  // 1. Rigged Three.js group
  const riggedGroup = new THREE.Group();
  const bonesByName = new Map<string, THREE.Bone>();
  for (const bName of REQUIRED_HUMANOID_BONES) {
    const bone = new THREE.Bone();
    bone.name = bName;
    if (bName === 'Hips') bone.position.y = 0.9;
    bonesByName.set(bName, bone);
    riggedGroup.add(bone);
  }
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
  riggedGroup.add(skinned);

  const riggedCaps = inspectRigCapabilities(riggedGroup);
  assert.equal(riggedCaps.isRigged, true);
  assert.equal(riggedCaps.hasHumanoidSkeleton, true);

  applyHumanoidProceduralPose({
    modelGroup: riggedGroup,
    basePositionY: 0,
    capabilities: riggedCaps,
    activity: 'typing',
    poseMode: 'seated',
    activeEmote: null,
    elapsedTime: 1.5,
    deltaSeconds: 0.5,
  });

  assert.ok(bonesByName.get('UpperLeg.L')!.rotation.x < -0.5, 'Seated pose bends upper leg forward');
  assert.ok(bonesByName.get('LowerLeg.L')!.rotation.x > 0.5, 'Seated pose bends lower leg down');
  assert.ok(bonesByName.get('UpperArm.L')!.rotation.x < -0.1, 'Typing pose brings upper arm forward');
  assert.ok(bonesByName.get('Hips')!.position.y < 0.9, 'Seated pose lowers hips onto chair');

  // Wave emote
  applyHumanoidProceduralPose({
    modelGroup: riggedGroup,
    basePositionY: 0,
    capabilities: riggedCaps,
    activity: 'idle',
    poseMode: 'standing',
    activeEmote: 'wave',
    elapsedTime: 2.0,
    deltaSeconds: 0.5,
  });
  assert.ok(bonesByName.get('UpperArm.R')!.rotation.z < -0.8, 'Wave raises right arm');

  // 2. Unrigged Three.js group
  const staticGroup = new THREE.Group();
  const staticHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
  staticHead.name = 'Head';
  staticGroup.add(staticHead);

  const staticCaps = inspectRigCapabilities(staticGroup);
  assert.equal(staticCaps.isRigged, false);
  assert.equal(staticCaps.hasHumanoidSkeleton, false);

  applyHumanoidProceduralPose({
    modelGroup: staticGroup,
    basePositionY: 0,
    capabilities: staticCaps,
    activity: 'typing',
    poseMode: 'seated',
    activeEmote: null,
    elapsedTime: 1.0,
    deltaSeconds: 0.016,
  });
  assert.equal(staticHead.rotation.x, 0, 'Unrigged mesh head is not force-rotated');
  assert.ok(Math.abs(staticGroup.position.y) > 0, 'Unrigged mesh receives gentle whole-model breathing');
});

test('Phase 9.5 animation state matrix: Avatar 01 supports all 8 states and Avatar 02 remains static across all states', () => {
  const riggedGroup = new THREE.Group();
  const bonesByName = new Map<string, THREE.Bone>();
  for (const bName of REQUIRED_HUMANOID_BONES) {
    const bone = new THREE.Bone();
    bone.name = bName;
    if (bName === 'Hips') bone.position.y = 0.9;
    bonesByName.set(bName, bone);
    riggedGroup.add(bone);
  }
  riggedGroup.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial()));
  const riggedCaps = inspectRigCapabilities(riggedGroup);

  const states: Array<{
    label: string;
    activity: 'standing' | 'idle' | 'studying' | 'typing' | 'reading' | 'walking';
    poseMode: 'standing' | 'seated';
    emote: 'celebrate' | null;
  }> = [
    { label: 'standing', activity: 'standing', poseMode: 'standing', emote: null },
    { label: 'seated', activity: 'idle', poseMode: 'seated', emote: null },
    { label: 'idle', activity: 'idle', poseMode: 'standing', emote: null },
    { label: 'studying', activity: 'studying', poseMode: 'seated', emote: null },
    { label: 'typing', activity: 'typing', poseMode: 'seated', emote: null },
    { label: 'reading', activity: 'reading', poseMode: 'seated', emote: null },
    { label: 'walking', activity: 'walking', poseMode: 'standing', emote: null },
    { label: 'celebration', activity: 'idle', poseMode: 'standing', emote: 'celebrate' },
  ];

  for (const st of states) {
    applyHumanoidProceduralPose({
      modelGroup: riggedGroup,
      basePositionY: 0,
      capabilities: riggedCaps,
      activity: st.activity,
      poseMode: st.poseMode,
      activeEmote: st.emote,
      elapsedTime: 1.25,
      deltaSeconds: 0.5,
    });
    assert.ok(Number.isFinite(riggedGroup.position.y), `Avatar 01 finite Y in ${st.label}`);
    assert.ok(Number.isFinite(bonesByName.get('Hips')!.position.y), `Avatar 01 finite hips in ${st.label}`);
  }

  assert.ok(bonesByName.get('UpperArm.L')!.rotation.z > 0.5, 'Celebration raises left arm');
  assert.ok(bonesByName.get('UpperArm.R')!.rotation.z < -0.5, 'Celebration raises right arm');

  const staticGroup = new THREE.Group();
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.77, 0.3), new THREE.MeshStandardMaterial());
  bodyMesh.name = 'Hoodie';
  staticGroup.add(bodyMesh);
  const staticCaps = inspectRigCapabilities(staticGroup);

  for (const st of states) {
    applyHumanoidProceduralPose({
      modelGroup: staticGroup,
      basePositionY: 0,
      capabilities: staticCaps,
      activity: st.activity,
      poseMode: st.poseMode,
      activeEmote: st.emote,
      elapsedTime: 1.25,
      deltaSeconds: 0.5,
    });
    assert.equal(bodyMesh.rotation.x, 0, `Avatar 02 mesh never force-rotated in ${st.label}`);
    assert.equal(bodyMesh.rotation.z, 0, `Avatar 02 mesh never force-tilted in ${st.label}`);
    assert.ok(Math.abs(staticGroup.position.y) <= 0.05, `Avatar 02 bounded gentle motion in ${st.label}`);
  }
});

test('Material customization service recolors Yuki & Ren independently, protects skin/eye_white, and preserves originals', () => {
  const makeMockAvatarScene = (matNames: string[], extraMeshName?: string) => {
    const group = new THREE.Group();
    for (const mName of matNames) {
      const mat = new THREE.MeshStandardMaterial({ name: mName, color: '#ffffff' });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat);
      mesh.name = mName;
      group.add(mesh);
    }
    if (extraMeshName) {
      const wMat = new THREE.MeshStandardMaterial({ name: 'watch_band', color: '#111111' });
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), wMat);
      wMesh.name = extraMeshName;
      group.add(wMesh);
    }
    return group;
  };

  // Yuki (avatar-01)
  const yukiScene = makeMockAvatarScene([
    'skin', 'eye_white', 'blush', 'hair', 'hair_light', 'iris_outer', 'iris_inner', 'cardigan', 'shirt', 'navy_pants', 'shoe_lav',
  ]);
  const sharedSkinMat = (yukiScene.getObjectByName('skin') as THREE.Mesh).material as THREE.MeshStandardMaterial;

  applyAvatarMaterialCustomization(yukiScene, 'avatar-01', {
    hairColor: '#9f1239',
    hairMaterial: 'glossy',
    eyeColor: '#10b981',
    irisColor: '#10b981',
    outfitPrimary: '#be185d',
    outfitSecondary: '#fef3c7',
    pantsColor: '#312e81',
    shoesColor: '#fda4af',
  });

  const yukiSkinAfter = (yukiScene.getObjectByName('skin') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const yukiCardigan = (yukiScene.getObjectByName('cardigan') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const yukiHair = (yukiScene.getObjectByName('hair') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const yukiEyeWhite = (yukiScene.getObjectByName('eye_white') as THREE.Mesh).material as THREE.MeshStandardMaterial;

  assert.notEqual(yukiSkinAfter, sharedSkinMat, 'Must clone materials per instance, never mutate shared cache');
  assert.equal(yukiSkinAfter.color.getHexString(), 'ffffff', 'Protected skin material must not be recolored');
  assert.equal(yukiEyeWhite.color.getHexString(), 'ffffff', 'Protected eye_white must not be recolored');
  assert.equal(yukiCardigan.color.getHexString(), 'be185d');
  assert.equal(yukiHair.color.getHexString(), '9f1239');
  assert.equal(yukiHair.roughness, 0.25, 'Glossy hair finish sets roughness 0.25');

  // Ren (avatar-02) with Watch accessory toggle
  const renScene = makeMockAvatarScene(['skin', 'hair', 'iris', 'navy', 'tee', 'black', 'shoe_navy'], 'Watch');
  applyAvatarMaterialCustomization(renScene, 'avatar-02', {
    hairColor: '#1e3a8a',
    outfitPrimary: '#0f766e',
    outfitSecondary: '#cbd5e1',
    pantsColor: '#27272a',
    shoesColor: '#f8fafc',
    accessories: [],
  });
  assert.equal(renScene.getObjectByName('Watch')!.visible, false, 'Watch hidden when not in accessories');

  applyAvatarMaterialCustomization(renScene, 'avatar-02', {
    hairColor: '#1e3a8a',
    accessories: ['watch'],
  });
  assert.equal(renScene.getObjectByName('Watch')!.visible, true, 'Watch visible when enabled');

  disposeClonedAvatarMaterials(yukiScene);
  disposeClonedAvatarMaterials(renScene);
});
