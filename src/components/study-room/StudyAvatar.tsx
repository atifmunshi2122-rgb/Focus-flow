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
import type { UserAvatarCustomization } from '../../features/avatar/avatar-catalog.ts';
import './StudyAvatar.css';

export type { StudyActivity };

type Vector3Tuple = [number, number, number];

export interface StudyAvatarProps {
  modelUrl: string;
  name: string;
  activity?: StudyActivity;
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: number;
  modelPosition?: Vector3Tuple;
  nameplateHeight?: number;
  animationOverrides?: Partial<Record<StudyActivity, string>>;
  customization?: UserAvatarCustomization;
  isLive?: boolean;
  isSelected?: boolean;
  subtitle?: string;
  emoteEvent?: AvatarEmoteEvent | null;
  onSelect?: () => void;
}

interface AvatarErrorBoundaryProps {
  name: string;
  position: Vector3Tuple;
  nameplateHeight: number;
  isLive?: boolean;
  subtitle?: string;
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

  render() {
    if (this.state.hasError) {
      return (
        <group position={this.props.position}>
          <Html position={[0, this.props.nameplateHeight * 0.55, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
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
                {this.props.subtitle && (
                  <span className={`avatar-nameplate-sub ${this.props.isLive ? 'avatar-nameplate-sub--live' : ''}`}>
                    {this.props.subtitle}
                  </span>
                )}
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
  animationOverrides,
  customization,
  isLive = false,
  isSelected = false,
  subtitle,
  emoteEvent = null,
  onSelect,
}: StudyAvatarProps) {
  const rootRef = useRef<Group>(null!);
  const modelGroupRef = useRef<Group>(null!);
  const seenEmotesRef = useRef<Set<string>>(new Set());
  const [activeEmote, setActiveEmote] = useState<AvatarEmote | null>(null);

  const { scene, animations } = useGLTF(modelUrl);

  // Clone models safely so multiple users can share the same cached GLB without sharing skeleton or material state.
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene]);

  // Apply user-specific material colors & accessories onto cloned scene
  useEffect(() => {
    clonedScene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (!customization) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;

      const clonedMat = mat.clone();
      if (clonedMat.name === 'HairMain' && customization.hairColor) {
        clonedMat.color.set(customization.hairColor);
      } else if (clonedMat.name === 'EyeIris' && customization.eyeColor) {
        clonedMat.color.set(customization.eyeColor);
        clonedMat.emissive.set(customization.eyeColor);
      } else if (clonedMat.name === 'OutfitPrimary' && customization.outfitColor) {
        clonedMat.color.set(customization.outfitColor);
      }
      mesh.material = clonedMat;
    });

    // Attach optional 3D accessories onto Head bone
    const headBone = clonedScene.getObjectByName('Head');
    if (headBone) {
      const prevAcc = headBone.getObjectByName('CustomAccessories');
      if (prevAcc) headBone.remove(prevAcc);

      const accList = customization?.accessories || [];
      if (accList.length > 0) {
        const accGroup = new THREE.Group();
        accGroup.name = 'CustomAccessories';

        if (accList.includes('glasses')) {
          const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.7, roughness: 0.25 });
          [-0.052, 0.052].forEach((lx) => {
            const lens = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 18), frameMat);
            lens.position.set(lx, 0.115, 0.142);
            accGroup.add(lens);
          });
          const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), frameMat);
          bridge.position.set(0, 0.115, 0.145);
          accGroup.add(bridge);
        }

        if (accList.includes('headphones')) {
          const hpMat = new THREE.MeshStandardMaterial({ color: '#6366f1', metalness: 0.5, roughness: 0.3 });
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 10, 24, Math.PI), hpMat);
          band.position.set(0, 0.13, 0);
          accGroup.add(band);
          [-0.158, 0.158].forEach((ex) => {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.024, 14), hpMat);
            cup.rotation.z = Math.PI / 2;
            cup.position.set(ex, 0.11, -0.005);
            accGroup.add(cup);
          });
        }

        headBone.add(accGroup);
      }
    }
  }, [clonedScene, customization]);

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

  const { animationName } = useStudyAvatarAnimation({
    actions,
    names,
    activity,
    preferredAnimation: animationOverrides?.[activity],
    activeEmote,
  });

  // Subtle procedural celebration bounce or idle breathing fallback
  useFrame(({ clock }) => {
    if (!modelGroupRef.current) return;
    const t = clock.getElapsedTime();
    if (activeEmote) {
      modelGroupRef.current.position.y = modelPosition[1] + Math.abs(Math.sin(t * 7)) * 0.045;
    } else if (!animationName) {
      modelGroupRef.current.position.y = modelPosition[1] + Math.sin(t * 2.1) * 0.012;
    } else {
      modelGroupRef.current.position.y = modelPosition[1];
    }
  });

  const emoteMeta = activeEmote ? EMOTE_META[activeEmote] : null;

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

      <Html position={[0, nameplateHeight, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
        <div className="flex flex-col items-center pointer-events-none">
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
      name={props.name}
      position={position}
      nameplateHeight={nameplateHeight}
      isLive={props.isLive}
      subtitle={props.subtitle}
    >
      <Suspense fallback={null}>
        <StudyAvatarMesh {...props} />
      </Suspense>
    </AvatarErrorBoundary>
  );
}
