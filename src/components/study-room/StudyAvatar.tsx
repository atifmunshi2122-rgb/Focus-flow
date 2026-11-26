import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Group } from 'three';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import {
  EMOTE_META,
  type AvatarEmote,
  type AvatarEmoteEvent,
  type StudyActivity,
} from '../../features/study-room/types.ts';
import { useStudyAvatarAnimation } from '../../features/study-room/useStudyAvatarAnimation.ts';
import {
  applyHumanoidProceduralPose,
  inspectRigCapabilities,
  type ProceduralPoseActivity,
  type RigCapabilities,
} from '../../features/study-room/humanoidRigController.ts';
import {
  applyAvatarMaterialCustomization,
  disposeClonedAvatarMaterials,
  inferMaterialProfile,
} from '../../features/avatar/avatarMaterialService.ts';
import type { UserAvatarCustomization } from '../../features/avatar/avatar-catalog.ts';
import './StudyAvatar.css';

export type { StudyActivity };

type Vector3Tuple = [number, number, number];

export type StudyAvatarActivity = ProceduralPoseActivity;

export interface StudyAvatarProps {
  modelUrl: string;
  name: string;
  activity?: StudyAvatarActivity;
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: number;
  modelPosition?: Vector3Tuple;
  nameplateHeight?: number;
  showNameplate?: boolean;
  poseMode?: 'standing' | 'seated' | 'sleeping';
  animationOverrides?: Partial<Record<StudyActivity, string>>;
  customization?: UserAvatarCustomization;
  isLive?: boolean;
  isSelected?: boolean;
  subtitle?: string;
  emoteEvent?: AvatarEmoteEvent | null;
  onSelect?: () => void;
  onRigInspected?: (capabilities: RigCapabilities) => void;
  onLoadError?: (errorMessage: string) => void;
}

interface AvatarErrorBoundaryProps {
  modelUrl: string;
  name: string;
  position: Vector3Tuple;
  nameplateHeight: number;
  isLive?: boolean;
  subtitle?: string;
  onLoadError?: (errorMessage: string) => void;
  children: React.ReactNode;
}

interface AvatarErrorBoundaryState {
  hasError: boolean;
}

class AvatarErrorBoundary extends Component<AvatarErrorBoundaryProps, AvatarErrorBoundaryState> {
  state: AvatarErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AvatarErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[StudyAvatar] Failed to load GLB model:', this.props.modelUrl, error, info);
    const message = error instanceof Error ? error.message : String(error || 'Failed to load GLB model');
    this.props.onLoadError?.(message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <group position={this.props.position}>
          <Html position={[0, this.props.nameplateHeight * 0.55, 0]} center zIndexRange={[20, 0]}>
            <div className="flex flex-col items-center gap-1.5 pointer-events-none">
              <div className="avatar-fallback">{this.props.name.slice(0, 1).toUpperCase()}</div>
              <div className={`avatar-nameplate ${this.props.isLive ? 'avatar-nameplate--live' : ''}`}>
                <div className="avatar-nameplate-row">
                  <span
                    className={`avatar-online-dot ${
                      this.props.isLive ? 'avatar-online-dot--live' : 'avatar-online-dot--idle'
                    }`}
                  />
                  <span>{this.props.name}</span>
                </div>
                <span className="avatar-nameplate-sub text-amber-300">
                  {this.props.subtitle || '3D model unavailable'}
                </span>
              </div>
            </div>
          </Html>
        </group>
      );
    }
    return this.props.children;
  }
}

function StudyAvatarMesh({
  modelUrl,
  name,
  activity = 'idle',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  modelPosition = [0, 0, 0],
  nameplateHeight = 1.65,
  showNameplate = true,
  poseMode = 'standing',
  animationOverrides,
  customization,
  isLive = false,
  isSelected = false,
  subtitle,
  emoteEvent = null,
  onSelect,
  onRigInspected,
}: StudyAvatarProps) {
  const rootRef = useRef<Group>(null!);
  const modelGroupRef = useRef<Group>(null!);
  const seenEmotesRef = useRef<Set<string>>(new Set());
  const [activeEmote, setActiveEmote] = useState<AvatarEmote | null>(null);

  const { scene, animations } = useGLTF(modelUrl);

  // Clone models safely so multiple users can share the same cached GLB without sharing skeleton or material state.
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene]);
  const rigCapabilities = useMemo(() => inspectRigCapabilities(clonedScene), [clonedScene]);

  useEffect(() => {
    onRigInspected?.(rigCapabilities);
  }, [rigCapabilities, onRigInspected]);

  // Apply anime lighting material enhancements, user-specific colors & accessories onto cloned scene
  useEffect(() => {
    const profileId = inferMaterialProfile(modelUrl);
    applyAvatarMaterialCustomization(clonedScene, profileId, customization);

    // Attach optional 3D accessories onto Head (supports both Bone in rigged GLB and Mesh in unrigged GLB)
    const headObj = clonedScene.getObjectByName('Head');
    if (headObj) {
      const prevAcc = headObj.getObjectByName('CustomAccessories');
      if (prevAcc) headObj.remove(prevAcc);

      const accList = customization?.accessories || [];
      if (accList.length > 0) {
        const accGroup = new THREE.Group();
        accGroup.name = 'CustomAccessories';

        // Compute head anchor offset: for Mesh heads (unrigged), geometry vertices live in world space
        let anchorX = 0;
        let anchorY = 0.115;
        let anchorZ = 0.135;
        let headRadius = 0.155;
        if ((headObj as THREE.Mesh).isMesh) {
          const box = new THREE.Box3().setFromObject(headObj);
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);
          headObj.worldToLocal(center);
          anchorX = center.x;
          anchorY = center.y + size.y * 0.04;
          anchorZ = center.z + size.z * 0.46;
          headRadius = Math.max(0.12, size.x * 0.52);
        }

        if (accList.includes('glasses')) {
          const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.7, roughness: 0.25 });
          [-0.046, 0.046].forEach((lx) => {
            const lens = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0038, 8, 18), frameMat);
            lens.position.set(anchorX + lx, anchorY, anchorZ);
            accGroup.add(lens);
          });
          const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.004), frameMat);
          bridge.position.set(anchorX, anchorY, anchorZ + 0.003);
          accGroup.add(bridge);
        }

        if (accList.includes('headphones')) {
          const hpMat = new THREE.MeshStandardMaterial({ color: '#6366f1', metalness: 0.5, roughness: 0.3 });
          const band = new THREE.Mesh(new THREE.TorusGeometry(headRadius, 0.011, 10, 24, Math.PI), hpMat);
          band.position.set(anchorX, anchorY + 0.015, anchorZ - headRadius * 0.85);
          accGroup.add(band);
          [-headRadius, headRadius].forEach((ex) => {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.022, 14), hpMat);
            cup.rotation.z = Math.PI / 2;
            cup.position.set(anchorX + ex, anchorY - 0.005, anchorZ - headRadius * 0.85);
            accGroup.add(cup);
          });
        }

        headObj.add(accGroup);
      }
    }

    return () => {
      disposeClonedAvatarMaterials(clonedScene);
    };
  }, [clonedScene, modelUrl, customization]);

  const { actions, names } = useAnimations(animations, rootRef);

  // One-time emote deduplication: never replay the same event ID on snapshot re-emits
  useEffect(() => {
    if (!emoteEvent || !emoteEvent.id) return;
    if (seenEmotesRef.current.has(emoteEvent.id)) return;
    seenEmotesRef.current.add(emoteEvent.id);

    setActiveEmote(emoteEvent.type);
    const timer = setTimeout(() => {
      setActiveEmote((curr) => (curr === emoteEvent.type ? null : curr));
    }, 3200);

    return () => clearTimeout(timer);
  }, [emoteEvent]);

  const clipActivity: StudyActivity =
    activity === 'walking' || activity === 'standing'
      ? 'idle'
      : activity === 'sleeping' || activity === 'eating' || activity === 'coffee' || activity === 'freshening_up'
      ? 'break'
      : activity;

  // Never let baked GLB sitting clips block procedural seated/sleeping/walking/home poses
  const forceProceduralPose =
    Boolean(activeEmote) ||
    poseMode === 'seated' ||
    poseMode === 'sleeping' ||
    activity === 'walking' ||
    activity === 'standing' ||
    activity === 'sleeping' ||
    activity === 'eating' ||
    activity === 'coffee' ||
    activity === 'freshening_up';

  const { animationName } = useStudyAvatarAnimation({
    actions,
    names,
    activity: clipActivity,
    preferredAnimation: animationOverrides?.[clipActivity],
    activeEmote,
    enabled: !forceProceduralPose,
  });

  // Reusable rig-capability-aware animation controller
  useFrame(({ clock }, delta) => {
    if (!modelGroupRef.current) return;
    if (animationName && !forceProceduralPose) {
      modelGroupRef.current.position.y = modelPosition[1];
      modelGroupRef.current.rotation.x = 0;
      modelGroupRef.current.rotation.z = 0;
      return;
    }
    applyHumanoidProceduralPose({
      modelGroup: modelGroupRef.current,
      basePositionY: modelPosition[1],
      capabilities: rigCapabilities,
      activity,
      poseMode,
      activeEmote,
      elapsedTime: clock.getElapsedTime(),
      deltaSeconds: delta,
    });
  });

  const emoteMeta = activeEmote ? EMOTE_META[activeEmote] : null;
  const isSleeping = poseMode === 'sleeping' || activity === 'sleeping';

  return (
    <group
      ref={rootRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        if (onSelect) {
          e.stopPropagation();
          onSelect();
        }
      }}
    >
      <group ref={modelGroupRef} position={modelPosition}>
        <primitive object={clonedScene} />
      </group>

      {showNameplate && (
        <Html position={[0, nameplateHeight, 0]} center zIndexRange={[20, 0]}>
          <div className="flex flex-col items-center pointer-events-none">
            {isSleeping && !emoteMeta && (
              <div className="avatar-sleeping-zzz">
                <span>💤</span>
                <span>Zzz...</span>
              </div>
            )}
            {emoteMeta && (
              <div className="avatar-emote-burst">
                <span>{emoteMeta.icon}</span>
                <span>{emoteMeta.label}</span>
              </div>
            )}
            <div
              className={`avatar-nameplate ${isLive ? 'avatar-nameplate--live' : ''} ${
                isSelected ? 'avatar-nameplate--selected' : ''
              }`}
            >
              <div className="avatar-nameplate-row">
                <span
                  className={`avatar-online-dot ${
                    isLive ? 'avatar-online-dot--live' : 'avatar-online-dot--idle'
                  }`}
                />
                <span>{name}</span>
              </div>
              {subtitle && (
                <span className={`avatar-nameplate-sub ${isLive ? 'avatar-nameplate-sub--live' : ''}`}>
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export function preloadStudyAvatarModels(urls: string[]) {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  for (const url of unique) {
    useGLTF.preload(url);
  }
}

export default function StudyAvatar(props: StudyAvatarProps) {
  const position = props.position ?? [0, 0, 0];
  const nameplateHeight = props.nameplateHeight ?? 1.65;

  return (
    <AvatarErrorBoundary
      modelUrl={props.modelUrl}
      name={props.name}
      position={position}
      nameplateHeight={nameplateHeight}
      isLive={props.isLive}
      subtitle={props.subtitle}
      onLoadError={props.onLoadError}
    >
      <Suspense fallback={null}>
        <StudyAvatarMesh {...props} />
      </Suspense>
    </AvatarErrorBoundary>
  );
}
