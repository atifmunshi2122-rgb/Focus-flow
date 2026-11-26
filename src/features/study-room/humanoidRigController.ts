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
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  chest?: THREE.Object3D;
  neck?: THREE.Object3D;
  head?: THREE.Object3D;
  shoulderL?: THREE.Object3D;
  shoulderR?: THREE.Object3D;
  upperArmL?: THREE.Object3D;
  upperArmR?: THREE.Object3D;
  lowerArmL?: THREE.Object3D;
  lowerArmR?: THREE.Object3D;
  handL?: THREE.Object3D;
  handR?: THREE.Object3D;
  upperLegL?: THREE.Object3D;
  upperLegR?: THREE.Object3D;
  lowerLegL?: THREE.Object3D;
  lowerLegR?: THREE.Object3D;
  footL?: THREE.Object3D;
  footR?: THREE.Object3D;
}

export type HumanoidRigKind = 'skinned' | 'rigid_node' | 'unrigged';

export interface RigCapabilities {
  isRigged: boolean;
  hasHumanoidSkeleton: boolean;
  rigKind: HumanoidRigKind;
  boneCount: number;
  bones: HumanoidBoneMap;
  restHipsY: number;
}

/**
 * Inspects a cloned Three.js scene graph for BOTH:
 * 1) Skinned Blender humanoid skeletons (Hips, UpperArm.L, UpperLeg.L, LowerLeg.L, SkinnedMesh)
 * 2) Rigid-node hierarchical humanoid rigs (Hips, LeftUpperArm, LeftUpperLeg, LeftLowerLeg, etc.)
 * Never fabricates joints or forces limb poses onto static unrigged meshes (e.g. avatar-02).
 */
export function inspectRigCapabilities(root: THREE.Object3D): RigCapabilities {
  let boneCount = 0;
  let hasSkinnedMesh = false;
  const boneByName = new Map<string, THREE.Bone>();
  const hierarchyNodeByName = new Map<string, THREE.Object3D>();

  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      boneCount += 1;
      if (obj.name && !boneByName.has(obj.name)) {
        boneByName.set(obj.name, obj as THREE.Bone);
      }
    }
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      hasSkinnedMesh = true;
    }
    if (obj.name && !(obj as THREE.Mesh).isMesh && !hierarchyNodeByName.has(obj.name)) {
      hierarchyNodeByName.set(obj.name, obj);
    }
  });

  const findJoint = (skinnedName: string, rigidName?: string): THREE.Object3D | undefined => {
    const boneMatch =
      boneByName.get(skinnedName) || (rigidName ? boneByName.get(rigidName) : undefined);
    if (boneMatch) return boneMatch;
    // Only map hierarchical Object3D nodes when the model isn't a broken partial mesh
    return (rigidName ? hierarchyNodeByName.get(rigidName) : undefined) || hierarchyNodeByName.get(skinnedName);
  };

  const bones: HumanoidBoneMap = {
    hips: findJoint('Hips'),
    spine: findJoint('Spine'),
    chest: findJoint('Chest'),
    neck: findJoint('Neck'),
    head: findJoint('Head'),
    shoulderL: findJoint('Shoulder.L'),
    shoulderR: findJoint('Shoulder.R'),
    upperArmL: findJoint('UpperArm.L', 'LeftUpperArm'),
    upperArmR: findJoint('UpperArm.R', 'RightUpperArm'),
    lowerArmL: findJoint('LowerArm.L', 'LeftLowerArm'),
    lowerArmR: findJoint('LowerArm.R', 'RightLowerArm'),
    handL: findJoint('Hand.L', 'LeftHand'),
    handR: findJoint('Hand.R', 'RightHand'),
    upperLegL: findJoint('UpperLeg.L', 'LeftUpperLeg'),
    upperLegR: findJoint('UpperLeg.R', 'RightUpperLeg'),
    lowerLegL: findJoint('LowerLeg.L', 'LeftLowerLeg'),
    lowerLegR: findJoint('LowerLeg.R', 'RightLowerLeg'),
    footL: findJoint('Foot.L', 'LeftFoot'),
    footR: findJoint('Foot.R', 'RightFoot'),
  };

  const hasCoreLimbs = Boolean(
    bones.hips &&
      bones.chest &&
      bones.head &&
      bones.upperArmL &&
      bones.upperArmR &&
      bones.upperLegL &&
      bones.upperLegR
  );

  const hasSkinnedHumanoid = Boolean(hasSkinnedMesh && boneCount > 0 && hasCoreLimbs);
  const hasRigidHumanoid = Boolean(!hasSkinnedMesh && hasCoreLimbs && bones.lowerLegL && bones.lowerLegR);

  const rigKind: HumanoidRigKind = hasSkinnedHumanoid
    ? 'skinned'
    : hasRigidHumanoid
    ? 'rigid_node'
    : 'unrigged';

  const hasHumanoidSkeleton = hasSkinnedHumanoid || hasRigidHumanoid;

  return {
    isRigged: (hasSkinnedMesh && boneCount > 0) || hasRigidHumanoid,
    hasHumanoidSkeleton,
    rigKind,
    boneCount,
    bones,
    restHipsY: bones.hips ? bones.hips.position.y : 0.9,
  };
}

export type ProceduralPoseActivity =
  | StudyActivity
  | 'walking'
  | 'standing'
  | 'sleeping'
  | 'eating'
  | 'coffee'
  | 'freshening_up';

export interface ProceduralPoseInput {
  modelGroup: THREE.Object3D;
  basePositionY: number;
  capabilities: RigCapabilities;
  activity: ProceduralPoseActivity;
  poseMode: 'standing' | 'seated' | 'sleeping';
  activeEmote: AvatarEmote | null;
  elapsedTime: number;
  deltaSeconds: number;
}

/**
 * Applies smooth, anatomically bounded procedural animation based on actual rig capabilities.
 * Unrigged static models (e.g. avatar-02) receive only gentle upright breathing/bounce so they
 * never clip horizontally or bend unjointed geometry.
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
  const alpha = Math.min(1, Math.max(0.06, deltaSeconds * 7.5));
  const { bones, hasHumanoidSkeleton, rigKind, restHipsY } = capabilities;

  // Unrigged static models: upright gentle breathing & celebration bounce only
  if (!hasHumanoidSkeleton) {
    modelGroup.rotation.x = THREE.MathUtils.lerp(modelGroup.rotation.x, 0, alpha);
    modelGroup.rotation.z = THREE.MathUtils.lerp(modelGroup.rotation.z, 0, alpha);
    const bounce = activeEmote ? Math.abs(Math.sin(t * 7)) * 0.04 : Math.sin(t * 2.0) * 0.007;
    modelGroup.position.y = basePositionY + bounce;
    return;
  }

  const effectiveSleeping = poseMode === 'sleeping' || activity === 'sleeping';
  const effectiveSeated =
    !effectiveSleeping &&
    poseMode === 'seated' &&
    activity !== 'walking' &&
    activity !== 'standing' &&
    activity !== 'freshening_up';

  // Proportional hip drop (~0.35m for 0.90m skinned rig, ~0.21m for 0.52m chibi rigid rig)
  const seatedHipDrop = Math.min(0.35, restHipsY * 0.4);
  const armRestOutwardZ = rigKind === 'skinned' ? 0.22 : 0.05;

  // 1. Model Group Orientation & Vertical Motion (Supine sleeping vs Walking bob vs Gentle breathing)
  const targetModelRotX = effectiveSleeping ? -Math.PI / 2 : 0;
  modelGroup.rotation.x = THREE.MathUtils.lerp(modelGroup.rotation.x, targetModelRotX, alpha);
  modelGroup.rotation.z = THREE.MathUtils.lerp(modelGroup.rotation.z, 0, alpha);

  let bounceY = Math.sin(t * 2.0) * 0.005;
  if (activeEmote) {
    bounceY = Math.abs(Math.sin(t * 7)) * 0.035;
  } else if (activity === 'walking') {
    bounceY = Math.abs(Math.sin(t * 7.5)) * 0.032;
  } else if (effectiveSleeping) {
    bounceY = Math.sin(t * 1.4) * 0.008;
  }
  modelGroup.position.y = basePositionY + bounceY;

  // 2. Hips height
  if (bones.hips) {
    const targetHipsY = effectiveSeated ? restHipsY - seatedHipDrop : restHipsY;
    bones.hips.position.y = THREE.MathUtils.lerp(bones.hips.position.y, targetHipsY, alpha);
    bones.hips.rotation.x = THREE.MathUtils.lerp(bones.hips.rotation.x, 0, alpha);
    bones.hips.rotation.y = THREE.MathUtils.lerp(bones.hips.rotation.y, 0, alpha);
    bones.hips.rotation.z = THREE.MathUtils.lerp(bones.hips.rotation.z, 0, alpha);
  }

  // 3. Spine & Chest breathing + posture lean
  const breath = effectiveSleeping ? Math.sin(t * 1.4) * 0.03 : Math.sin(t * 1.9) * 0.022;
  if (bones.spine) {
    let targetSpineX = 0.01;
    if (effectiveSleeping) {
      targetSpineX = 0;
    } else if (
      effectiveSeated &&
      (activity === 'studying' || activity === 'reading' || activity === 'writing' || activity === 'eating')
    ) {
      targetSpineX = 0.06;
    } else if (activity === 'walking') {
      targetSpineX = 0.04;
    } else if (activity === 'freshening_up') {
      targetSpineX = 0.09;
    }
    bones.spine.rotation.x = THREE.MathUtils.lerp(bones.spine.rotation.x, targetSpineX, alpha);
  }

  if (bones.chest) {
    let targetChestX = breath;
    let targetChestY = Math.sin(t * 0.7) * 0.025;
    if (effectiveSleeping) {
      targetChestX = breath;
      targetChestY = 0;
    } else if (activity === 'typing' || activity === 'writing') {
      targetChestX = 0.05 + breath;
    } else if (activity === 'walking') {
      targetChestY = Math.sin(t * 7.5) * 0.06;
    } else if (activity === 'eating') {
      targetChestX = 0.04 + Math.sin(t * 3.2) * 0.025;
    }
    bones.chest.rotation.x = THREE.MathUtils.lerp(bones.chest.rotation.x, targetChestX, alpha);
    bones.chest.rotation.y = THREE.MathUtils.lerp(bones.chest.rotation.y, targetChestY, alpha);
  }

  // 4. Shoulders subtle breathing lift
  if (bones.shoulderL && bones.shoulderR) {
    const shoulderLift = Math.sin(t * 1.9) * 0.018;
    bones.shoulderL.rotation.z = THREE.MathUtils.lerp(bones.shoulderL.rotation.z, shoulderLift, alpha);
    bones.shoulderR.rotation.z = THREE.MathUtils.lerp(bones.shoulderR.rotation.z, -shoulderLift, alpha);
  }

  // 5. Head look & activity motion
  if (bones.head) {
    let headX = Math.sin(t * 1.1) * 0.03;
    let headY = Math.sin(t * 0.55) * 0.08;
    if (effectiveSleeping) {
      headX = 0.04;
      headY = 0.12 + Math.sin(t * 0.45) * 0.06;
    } else if (activity === 'reading' || activity === 'studying' || activity === 'writing') {
      headX = 0.14 + Math.sin(t * 1.2) * 0.035;
      headY = Math.sin(t * 0.65) * 0.06;
    } else if (activity === 'typing') {
      headX = 0.08 + Math.sin(t * 1.6) * 0.025;
      headY = Math.sin(t * 0.85) * 0.05;
    } else if (activity === 'eating') {
      headX = 0.1 + Math.max(0, Math.sin(t * 3.2)) * 0.09;
      headY = Math.sin(t * 0.8) * 0.04;
    } else if (activity === 'coffee') {
      headX = -0.04 + Math.max(0, Math.sin(t * 1.5)) * 0.08;
      headY = Math.sin(t * 0.6) * 0.06;
    } else if (activity === 'freshening_up') {
      headX = 0.06 + Math.sin(t * 1.8) * 0.04;
      headY = Math.sin(t * 1.2) * 0.1;
    } else if (activity === 'walking') {
      headX = 0.02 + Math.sin(t * 7.5) * 0.025;
      headY = Math.sin(t * 0.9) * 0.05;
    } else if (activeEmote === 'success') {
      headX = Math.sin(t * 6.5) * 0.14;
    }
    bones.head.rotation.x = THREE.MathUtils.lerp(bones.head.rotation.x, headX, alpha);
    bones.head.rotation.y = THREE.MathUtils.lerp(bones.head.rotation.y, headY, alpha);
  }

  // 6. Arms & Hands (Left arm = +X, Right arm = -X, Forward = -X rotation around shoulder)
  if (bones.upperArmL && bones.upperArmR && bones.lowerArmL && bones.lowerArmR) {
    let uLx = 0, uLz = -armRestOutwardZ;
    let uRx = 0, uRz = armRestOutwardZ;
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
    } else if (effectiveSleeping) {
      // Relaxed arms resting softly beside torso on the mattress
      uLx = -0.04;
      uLz = -armRestOutwardZ * 0.5;
      uRx = -0.04;
      uRz = armRestOutwardZ * 0.5;
      lLx = -0.18;
      lRx = -0.18;
    } else if (activity === 'walking') {
      const armSwing = Math.sin(t * 7.5) * 0.42;
      uLx = -armSwing;
      uRx = armSwing;
      lLx = -0.24 - Math.max(0, -armSwing) * 0.25;
      lRx = -0.24 - Math.max(0, armSwing) * 0.25;
    } else if (activity === 'typing') {
      uLx = -0.45;
      uLz = -armRestOutwardZ * 0.8;
      uRx = -0.45;
      uRz = armRestOutwardZ * 0.8;
      lLx = -0.78 + Math.sin(t * 8) * 0.07;
      lLy = 0.26;
      lRx = -0.78 + Math.cos(t * 8) * 0.07;
      lRy = -0.26;
    } else if (activity === 'writing') {
      uLx = -0.32;
      uLz = -armRestOutwardZ * 0.85;
      uRx = -0.46;
      uRz = armRestOutwardZ * 0.72;
      lLx = -0.62;
      lLy = 0.2;
      lRx = -0.75 + Math.sin(t * 5.5) * 0.06;
      lRy = -0.24 + Math.cos(t * 4.5) * 0.05;
    } else if (activity === 'reading' || activity === 'studying') {
      uLx = -0.28;
      uLz = -armRestOutwardZ * 0.85;
      uRx = -0.28;
      uRz = armRestOutwardZ * 0.85;
      lLx = -0.58 + Math.sin(t * 1.1) * 0.03;
      lLy = 0.22;
      lRx = -0.58 - Math.sin(t * 1.1) * 0.03;
      lRy = -0.22;
    } else if (activity === 'eating') {
      // Right hand brings utensil smoothly upward while left hand rests near bowl/table
      const chewCycle = (Math.sin(t * 3.2) + 1) * 0.5;
      uLx = -0.26;
      uLz = -armRestOutwardZ * 0.8;
      lLx = -0.65;
      lLy = 0.22;
      uRx = -0.46 - chewCycle * 0.16;
      uRz = armRestOutwardZ * 0.7;
      lRx = -0.72 - chewCycle * 0.55;
      lRy = -0.28;
    } else if (activity === 'coffee') {
      // Holding a warm mug in right hand with occasional sipping lift
      const sip = Math.max(0, Math.sin(t * 1.4));
      uLx = Math.sin(t * 1.2) * 0.03;
      lLx = -0.14;
      uRx = -0.42 - sip * 0.22;
      uRz = armRestOutwardZ * 0.65;
      lRx = -0.78 - sip * 0.45;
      lRy = -0.22;
    } else if (activity === 'freshening_up') {
      // Washing hands / freshening up in front of vanity mirror & sink
      uLx = -0.48 + Math.sin(t * 4.5) * 0.05;
      uLz = -armRestOutwardZ * 0.6;
      uRx = -0.48 - Math.sin(t * 4.5) * 0.05;
      uRz = armRestOutwardZ * 0.6;
      lLx = -0.78 + Math.sin(t * 4.5) * 0.14;
      lLy = 0.3;
      lRx = -0.78 - Math.sin(t * 4.5) * 0.14;
      lRy = -0.3;
    } else {
      // Idle standing or seated
      uLx = Math.sin(t * 1.4) * 0.03;
      uRx = -Math.sin(t * 1.4) * 0.03;
      lLx = effectiveSeated ? -0.32 : -0.1;
      lRx = effectiveSeated ? -0.32 : -0.1;
    }

    bones.upperArmL.rotation.x = THREE.MathUtils.lerp(bones.upperArmL.rotation.x, uLx, alpha);
    bones.upperArmL.rotation.y = THREE.MathUtils.lerp(bones.upperArmL.rotation.y, 0, alpha);
    bones.upperArmL.rotation.z = THREE.MathUtils.lerp(bones.upperArmL.rotation.z, uLz, alpha);
    bones.upperArmR.rotation.x = THREE.MathUtils.lerp(bones.upperArmR.rotation.x, uRx, alpha);
    bones.upperArmR.rotation.y = THREE.MathUtils.lerp(bones.upperArmR.rotation.y, 0, alpha);
    bones.upperArmR.rotation.z = THREE.MathUtils.lerp(bones.upperArmR.rotation.z, uRz, alpha);

    bones.lowerArmL.rotation.x = THREE.MathUtils.lerp(bones.lowerArmL.rotation.x, lLx, alpha);
    bones.lowerArmL.rotation.y = THREE.MathUtils.lerp(bones.lowerArmL.rotation.y, lLy, alpha);
    bones.lowerArmL.rotation.z = THREE.MathUtils.lerp(bones.lowerArmL.rotation.z, lLz, alpha);
    bones.lowerArmR.rotation.x = THREE.MathUtils.lerp(bones.lowerArmR.rotation.x, lRx, alpha);
    bones.lowerArmR.rotation.y = THREE.MathUtils.lerp(bones.lowerArmR.rotation.y, lRy, alpha);
    bones.lowerArmR.rotation.z = THREE.MathUtils.lerp(bones.lowerArmR.rotation.z, lRz, alpha);
  }

  // 7. Legs (seated chair bend vs walking stride vs relaxed sleeping vs upright standing)
  if (bones.upperLegL && bones.upperLegR && bones.lowerLegL && bones.lowerLegR) {
    let ulLx = 0, ulRx = 0, llLx = 0, llRx = 0;

    if (effectiveSleeping) {
      ulLx = 0.04;
      ulRx = -0.03;
      llLx = 0.06;
      llRx = 0.08;
    } else if (effectiveSeated) {
      ulLx = -1.34;
      ulRx = -1.34;
      llLx = 1.34;
      llRx = 1.34;
    } else if (activity === 'walking') {
      const legPhase = t * 7.5;
      ulLx = Math.sin(legPhase) * 0.46;
      ulRx = -Math.sin(legPhase) * 0.46;
      llLx = Math.max(0, Math.sin(legPhase + 0.55) * 0.56);
      llRx = Math.max(0, -Math.sin(legPhase + 0.55) * 0.56);
    }

    bones.upperLegL.rotation.x = THREE.MathUtils.lerp(bones.upperLegL.rotation.x, ulLx, alpha);
    bones.upperLegL.rotation.y = THREE.MathUtils.lerp(bones.upperLegL.rotation.y, 0, alpha);
    bones.upperLegL.rotation.z = THREE.MathUtils.lerp(bones.upperLegL.rotation.z, 0, alpha);

    bones.upperLegR.rotation.x = THREE.MathUtils.lerp(bones.upperLegR.rotation.x, ulRx, alpha);
    bones.upperLegR.rotation.y = THREE.MathUtils.lerp(bones.upperLegR.rotation.y, 0, alpha);
    bones.upperLegR.rotation.z = THREE.MathUtils.lerp(bones.upperLegR.rotation.z, 0, alpha);

    bones.lowerLegL.rotation.x = THREE.MathUtils.lerp(bones.lowerLegL.rotation.x, llLx, alpha);
    bones.lowerLegL.rotation.y = THREE.MathUtils.lerp(bones.lowerLegL.rotation.y, 0, alpha);
    bones.lowerLegL.rotation.z = THREE.MathUtils.lerp(bones.lowerLegL.rotation.z, 0, alpha);

    bones.lowerLegR.rotation.x = THREE.MathUtils.lerp(bones.lowerLegR.rotation.x, llRx, alpha);
    bones.lowerLegR.rotation.y = THREE.MathUtils.lerp(bones.lowerLegR.rotation.y, 0, alpha);
    bones.lowerLegR.rotation.z = THREE.MathUtils.lerp(bones.lowerLegR.rotation.z, 0, alpha);
  }
}
