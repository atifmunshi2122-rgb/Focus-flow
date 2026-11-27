import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { HomeZoneId } from '../../features/home/homeRoutineEngine.ts';
import type { FurnitureShortcutId } from '../../features/home/homeFeaturesEngine.ts';
import type {
  GlbInteractionTarget,
  HomeRoomThemeConfig,
} from '../../features/home/homeRoomCatalog.ts';
import type { RoomLighting } from '../../features/study-room/customization-types.ts';

interface GlbRoomModelProps {
  config: HomeRoomThemeConfig;
  lightingMode: RoomLighting;
  lampDimFactor?: number;
  isStudying?: boolean;
  isSleeping?: boolean;
  onSelectZone?: (zone: HomeZoneId) => void;
  onClickFloor?: (x: number, z: number) => void;
  onClickFurniture?: (shortcut: FurnitureShortcutId) => void;
}

function resolveInteractionTarget(
  object: THREE.Object3D | null,
  interactionMap?: Record<string, GlbInteractionTarget>
): GlbInteractionTarget | null {
  if (!interactionMap) return null;
  let cur: THREE.Object3D | null = object;
  while (cur) {
    const name = cur.name || '';
    if (name) {
      if (interactionMap[name]) return interactionMap[name];
      for (const key of Object.keys(interactionMap)) {
        if (name.startsWith(key)) return interactionMap[key];
      }
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * Reusable on-demand GLB room renderer driven by HOME_ROOM_CATALOG.
 * Intentionally avoids top-level useGLTF.preload so unselected/locked rooms
 * are never downloaded prematurely, and disposes cloned materials on unmount.
 */
export const GlbRoomModel: React.FC<GlbRoomModelProps> = ({
  config,
  lightingMode,
  lampDimFactor = 1,
  isStudying = false,
  isSleeping = false,
  onSelectZone,
  onClickFloor,
  onClickFurniture,
}) => {
  const glbUrl = config.glbUrl!;
  const { scene } = useGLTF(glbUrl);
  const clockHourRef = useRef<THREE.Object3D | null>(null);
  const clockMinRef = useRef<THREE.Object3D | null>(null);
  const canopyRefs = useRef<THREE.Object3D[]>([]);
  const tzOffsetMs = useMemo(() => -new Date().getTimezoneOffset() * 60_000, []);

  const clonedScene = useMemo(() => {
    const root = scene.clone(true);
    const canopies: THREE.Object3D[] = [];
    clockHourRef.current = null;
    clockMinRef.current = null;

    root.traverse((obj) => {
      if (config.animateClockAndCanopy) {
        if (obj.name === 'ClockHourPivot') clockHourRef.current = obj;
        if (obj.name === 'ClockMinutePivot') clockMinRef.current = obj;
        if (obj.name === 'TreeCanopyPivot' || obj.name === 'StudyVineSwayPivot') {
          canopies.push(obj);
        }
      }

      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => m.clone());
          } else {
            mesh.material = mesh.material.clone();
          }
        }
      }
      if ((obj as THREE.Light).isLight) {
        const light = obj as THREE.Light;
        light.userData.__baseIntensity = light.intensity;
      }
    });

    canopyRefs.current = canopies;
    return root;
  }, [scene, config.animateClockAndCanopy]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
      clonedScene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            mat?.dispose?.();
          }
        }
      });
    };
  }, [clonedScene]);

  useEffect(() => {
    const isNight = lightingMode === 'night';
    const isSunset = lightingMode === 'sunset';
    const lightScale =
      (isSleeping ? 0.35 : isNight ? 1.15 : isSunset ? 0.95 : 0.65) * lampDimFactor;

    clonedScene.traverse((obj) => {
      if ((obj as THREE.Light).isLight) {
        const light = obj as THREE.Light;
        const base =
          typeof light.userData.__baseIntensity === 'number'
            ? light.userData.__baseIntensity
            : 1;
        light.intensity = base * lightScale;
      }
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat && 'emissiveIntensity' in mat) {
            const std = mat as THREE.MeshStandardMaterial;
            if (typeof std.userData.__baseEmissive !== 'number') {
              std.userData.__baseEmissive = std.emissiveIntensity ?? 1;
            }
            const boost = isStudying ? 1.18 : isNight ? 1.1 : 0.9;
            std.emissiveIntensity = std.userData.__baseEmissive * boost * lampDimFactor;
          }
        }
      }
    });
  }, [clonedScene, lightingMode, lampDimFactor, isStudying, isSleeping]);

  useFrame(({ clock }) => {
    if (!config.animateClockAndCanopy) return;
    const t = clock.getElapsedTime();
    const localMs = Date.now() + tzOffsetMs;
    const secsInDay = Math.floor(localMs / 1000) % 86400;
    const mins = (secsInDay % 3600) / 60;
    const hrs = (secsInDay / 3600) % 12;

    if (clockHourRef.current) {
      clockHourRef.current.rotation.z = -(hrs / 12) * Math.PI * 2;
    }
    if (clockMinRef.current) {
      clockMinRef.current.rotation.z = -(mins / 60) * Math.PI * 2;
    }
    for (let i = 0; i < canopyRefs.current.length; i++) {
      canopyRefs.current[i].rotation.z = Math.sin(t * 0.9 + i * 0.8) * 0.025;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const target = resolveInteractionTarget(e.object, config.interactionMap);
    if (!target) return;
    e.stopPropagation();

    if (target.type === 'floor') {
      onClickFloor?.(e.point.x, e.point.z);
    } else if (target.type === 'furniture') {
      onClickFurniture?.(target.shortcut);
    } else if (target.type === 'zone') {
      onSelectZone?.(target.zone);
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (resolveInteractionTarget(e.object, config.interactionMap)) {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  const scale = config.scale ?? 1;
  const offset = config.offset ?? [0, 0, 0];

  return (
    <group>
      {config.plinth && (
        <mesh position={config.plinth.position} receiveShadow>
          <boxGeometry args={config.plinth.size} />
          <meshStandardMaterial
            color={config.plinth.color || '#162040'}
            roughness={0.8}
            metalness={0.08}
          />
        </mesh>
      )}
      <primitive
        object={clonedScene}
        position={offset}
        scale={[scale, scale, scale]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />
    </group>
  );
};

