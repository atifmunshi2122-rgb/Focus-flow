import * as THREE from 'three';
import type { AvatarEmote, StudyActivity } from './types.ts';

export const REQUIRED_HUMANOID_BONES = [
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'Shoulder.L',
  'UpperArm.L',
  'LowerArm.L',
  'Hand.L',
  'Shoulder.R',
  'UpperArm.R',
  'LowerArm.R',
  'Hand.R',
  'UpperLeg.L',
  'LowerLeg.L',
  'Foot.L',
  'UpperLeg.R',
  'LowerLeg.R',
  'Foot.R',
] as const;

export interface HumanoidBoneMap {
  hips?: THREE.Bone;
  spine?: THREE.Bone;
  chest?: THREE.Bone;
  neck?: THREE.Bone;
  head?: THREE.Bone;
  shoulderL?: THREE.Bone;
  shoulderR?: THREE.Bone;
  upperArmL?: THREE.Bone;
  upperArmR?: THREE.Bone;
  lowerArmL?: THREE.Bone;
  lowerArmR?: THREE.Bone;
  handL?: THREE.Bone;
  handR?: THREE.Bone;
  upperLegL?: THREE.Bone;
  upperLegR?: THREE.Bone;
  lowerLegL?: THREE.Bone;
  lowerLegR?: THREE.Bone;
  footL?: THREE.Bone;
  footR?: THREE.Bone;
}

export interface RigCapabilities {
  isRigged: boolean;
  hasHumanoidSkeleton: boolean;
  boneCount: number;
  bones: HumanoidBoneMap;
  restHipsY: number;
}

function findBone(root: THREE.Object3D, name: string): THREE.Bone | undefined {
  const obj = root.getObjectByName(name);
  return obj && (obj as THREE.Bone).isBone ? (obj as THREE.Bone) : undefined;
}

/**
 * Inspects a cloned Three.js scene graph for real skinned humanoid bones.
 * Never fabricates bones or assumes an unrigged mesh has skeletal joints.
 */
export function inspectRigCapabilities(root: THREE.Object3D): RigCapabilities {
  let boneCount = 0;
  let hasSkinnedMesh = false;

  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) boneCount += 1;
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true;
  });

  const bones: HumanoidBoneMap = {
    hips: findBone(root, 'Hips'),
    spine: findBone(root, 'Spine'),
    chest: findBone(root, 'Chest'),
    neck: findBone(root, 'Neck'),
    head: findBone(root, 'Head'),
    shoulderL: findBone(root, 'Shoulder.L'),
    shoulderR: findBone(root, 'Shoulder.R'),
    upperArmL: findBone(root, 'UpperArm.L'),
    upperArmR: findBone(root, 'UpperArm.R'),
    lowerArmL: findBone(root, 'LowerArm.L'),
    lowerArmR: findBone(root, 'LowerArm.R'),
    handL: findBone(root, 'Hand.L'),
    handR: findBone(root, 'Hand.R'),
    upperLegL: findBone(root, 'UpperLeg.L'),
    upperLegR: findBone(root, 'UpperLeg.R'),
    lowerLegL: findBone(root, 'LowerLeg.L'),
    lowerLegR: findBone(root, 'LowerLeg.R'),
    footL: findBone(root, 'Foot.L'),
    footR: findBone(root, 'Foot.R'),
  };

  const hasHumanoidSkeleton = Boolean(
    hasSkinnedMesh &&
      bones.hips &&
      bones.chest &&
      bones.head &&
      bones.upperArmL &&
      bones.upperArmR &&
      bones.upperLegL &&
      bones.upperLegR
  );

  return {
    isRigged: hasSkinnedMesh && boneCount > 0,
    hasHumanoidSkeleton,
    boneCount,
    bones,
    restHipsY: bones.hips ? bones.hips.position.y : 0.9,
  };
}

export interface ProceduralPoseInput {
  modelGroup: THREE.Object3D;
  basePositionY: number;
  capabilities: RigCapabilities;
  activity: StudyActivity | 'walking' | 'standing';
  poseMode: 'standing' | 'seated';
  activeEmote: AvatarEmote | null;
  elapsedTime: number;
  deltaSeconds: number;
}

/**
 * Applies smooth, anatomically bounded procedural animation based on actual rig capabilities.
 * Unrigged models receive only subtle whole-model breathing (never forced limb poses).
 */
export function applyHumanoidProceduralPose({
  modelGroup,
  basePositionY,
  capabilities,
  activity,
  poseMode,
  activeEmote,
  elapsedTime: t,
  deltaSeconds,
}: ProceduralPoseInput): void {
  const alpha = Math.min(1, Math.max(0.05, deltaSeconds * 6));
  const { bones, hasHumanoidSkeleton, restHipsY } = capabilities;

  // Unrigged static models: gentle breathing & celebration bounce only
  if (!hasHumanoidSkeleton) {
    const bounce = activeEmote ? Math.abs(Math.sin(t * 7)) * 0.04 : Math.sin(t * 2.0) * 0.007;
    modelGroup.position.y = basePositionY + bounce;
    return;
  }

  const effectiveSeated = poseMode === 'seated' && activity !== 'walking' && activity !== 'standing';

  // Root & Hips
  if (bones.hips) {
    const targetHipsY = effectiveSeated ? restHipsY - 0.35 : restHipsY;
    bones.hips.position.y = THREE.MathUtils.lerp(bones.hips.position.y, targetHipsY, alpha);
  }
  const bounceY = activeEmote ? Math.abs(Math.sin(t * 7)) * 0.035 : Math.sin(t * 2.0) * 0.005;
  modelGroup.position.y = basePositionY + bounceY;

  // Spine & Chest breathing + natural lean
  const breath = Math.sin(t * 1.9) * 0.022;
  if (bones.spine) {
    const targetSpineX =
      effectiveSeated && (activity === 'studying' || activity === 'reading' || activity === 'writing')
        ? 0.06
        : 0.01;
    bones.spine.rotation.x = THREE.MathUtils.lerp(bones.spine.rotation.x, targetSpineX, alpha);
  }
  if (bones.chest) {
    const targetChestX =
      (activity === 'typing' || activity === 'writing' ? 0.05 : 0.01) + breath;
    bones.chest.rotation.x = THREE.MathUtils.lerp(bones.chest.rotation.x, targetChestX, alpha);
    bones.chest.rotation.y = THREE.MathUtils.lerp(
      bones.chest.rotation.y,
      Math.sin(t * 0.7) * 0.025,
      alpha
    );
  }

  // Shoulders subtle breathing lift
  if (bones.shoulderL && bones.shoulderR) {
    const shoulderLift = Math.sin(t * 1.9) * 0.018;
    bones.shoulderL.rotation.z = THREE.MathUtils.lerp(bones.shoulderL.rotation.z, shoulderLift, alpha);
    bones.shoulderR.rotation.z = THREE.MathUtils.lerp(bones.shoulderR.rotation.z, -shoulderLift, alpha);
  }

  // Head natural look & reading/typing motion
  if (bones.head) {
    let headX = Math.sin(t * 1.1) * 0.03;
    let headY = Math.sin(t * 0.55) * 0.08;
    if (activity === 'reading' || activity === 'studying' || activity === 'writing') {
      headX = 0.14 + Math.sin(t * 1.2) * 0.035;
      headY = Math.sin(t * 0.65) * 0.06;
    } else if (activity === 'typing') {
      headX = 0.08 + Math.sin(t * 1.6) * 0.025;
      headY = Math.sin(t * 0.85) * 0.05;
    } else if (activeEmote === 'success') {
      headX = Math.sin(t * 6.5) * 0.14;
    }
    bones.head.rotation.x = THREE.MathUtils.lerp(bones.head.rotation.x, headX, alpha);
    bones.head.rotation.y = THREE.MathUtils.lerp(bones.head.rotation.y, headY, alpha);
  }

  // Arms & Hands (respecting A-pose rest orientation: +Z is front, L is +X, R is -X)
  if (bones.upperArmL && bones.upperArmR && bones.lowerArmL && bones.lowerArmR) {
    let uLx = 0, uLz = -0.22;
    let uRx = 0, uRz = 0.22;
    let lLx = -0.08, lLy = 0, lLz = 0;
    let lRx = -0.08, lRy = 0, lRz = 0;

    if (activeEmote === 'wave') {
      uRx = -0.25;
      uRz = -1.85;
      lRz = -0.35 + Math.sin(t * 8) * 0.32;
      uLx = Math.sin(t * 1.4) * 0.03;
    } else if (activeEmote === 'celebrate' || activeEmote === 'clap' || activeEmote === 'success') {
      uLx = -0.3;
      uLz = 1.65 + Math.sin(t * 6) * 0.1;
      uRx = -0.3;
      uRz = -1.65 - Math.sin(t * 6) * 0.1;
      lLx = -0.35;
      lRx = -0.35;
    } else if (activity === 'typing') {
      uLx = -0.45;
      uLz = -0.18;
      uRx = -0.45;
      uRz = 0.18;
      lLx = -0.78 + Math.sin(t * 8) * 0.07;
      lLy = 0.26;
      lRx = -0.78 + Math.cos(t * 8) * 0.07;
      lRy = -0.26;
    } else if (activity === 'writing') {
      uLx = -0.32;
      uLz = -0.2;
      uRx = -0.46;
      uRz = 0.16;
      lLx = -0.62;
      lLy = 0.2;
      lRx = -0.75 + Math.sin(t * 5.5) * 0.06;
      lRy = -0.24 + Math.cos(t * 4.5) * 0.05;
    } else if (activity === 'reading' || activity === 'studying') {
      uLx = -0.28;
      uLz = -0.2;
      uRx = -0.28;
      uRz = 0.2;
      lLx = -0.58 + Math.sin(t * 1.1) * 0.03;
      lLy = 0.22;
      lRx = -0.58 - Math.sin(t * 1.1) * 0.03;
      lRy = -0.22;
    } else if (activity === 'walking') {
      uLx = Math.sin(t * 5) * 0.35;
      uRx = -Math.sin(t * 5) * 0.35;
      lLx = -0.22;
      lRx = -0.22;
    } else {
      // Idle standing or seated
      uLx = Math.sin(t * 1.4) * 0.03;
      uRx = -Math.sin(t * 1.4) * 0.03;
      lLx = effectiveSeated ? -0.32 : -0.1;
      lRx = effectiveSeated ? -0.32 : -0.1;
    }

    bones.upperArmL.rotation.x = THREE.MathUtils.lerp(bones.upperArmL.rotation.x, uLx, alpha);
    bones.upperArmL.rotation.z = THREE.MathUtils.lerp(bones.upperArmL.rotation.z, uLz, alpha);
    bones.upperArmR.rotation.x = THREE.MathUtils.lerp(bones.upperArmR.rotation.x, uRx, alpha);
    bones.upperArmR.rotation.z = THREE.MathUtils.lerp(bones.upperArmR.rotation.z, uRz, alpha);

    bones.lowerArmL.rotation.x = THREE.MathUtils.lerp(bones.lowerArmL.rotation.x, lLx, alpha);
    bones.lowerArmL.rotation.y = THREE.MathUtils.lerp(bones.lowerArmL.rotation.y, lLy, alpha);
    bones.lowerArmL.rotation.z = THREE.MathUtils.lerp(bones.lowerArmL.rotation.z, lLz, alpha);
    bones.lowerArmR.rotation.x = THREE.MathUtils.lerp(bones.lowerArmR.rotation.x, lRx, alpha);
    bones.lowerArmR.rotation.y = THREE.MathUtils.lerp(bones.lowerArmR.rotation.y, lRy, alpha);
    bones.lowerArmR.rotation.z = THREE.MathUtils.lerp(bones.lowerArmR.rotation.z, lRz, alpha);
  }

  // Legs (seated chair pose vs standing vs walking)
  if (bones.upperLegL && bones.upperLegR && bones.lowerLegL && bones.lowerLegR) {
    let ulLx = 0, ulRx = 0, llLx = 0, llRx = 0;

    if (effectiveSeated) {
      ulLx = -1.34;
      ulRx = -1.34;
      llLx = 1.34;
      llRx = 1.34;
    } else if (activity === 'walking') {
      ulLx = Math.sin(t * 5) * 0.42;
      ulRx = -Math.sin(t * 5) * 0.42;
      llLx = Math.max(0, Math.sin(t * 5 + 0.6) * 0.52);
      llRx = Math.max(0, -Math.sin(t * 5 + 0.6) * 0.52);
    }

    bones.upperLegL.rotation.x = THREE.MathUtils.lerp(bones.upperLegL.rotation.x, ulLx, alpha);
    bones.upperLegR.rotation.x = THREE.MathUtils.lerp(bones.upperLegR.rotation.x, ulRx, alpha);
    bones.lowerLegL.rotation.x = THREE.MathUtils.lerp(bones.lowerLegL.rotation.x, llLx, alpha);
    bones.lowerLegR.rotation.x = THREE.MathUtils.lerp(bones.lowerLegR.rotation.x, llRx, alpha);
  }
}
