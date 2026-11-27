import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { HomeZoneId } from '../../features/home/homeRoutineEngine.ts';
import type { FurnitureShortcutId } from '../../features/home/homeFeaturesEngine.ts';
import type { RoomLighting } from '../../features/study-room/customization-types.ts';

const ANIME_STUDIO_GLB_URL = '/models/anime-studio-room.glb';

// Align GLB floor top (y = 0.06) to y = 0 and center footprint around (0, 0)
const ROOM_SCALE = 0.78;
const ROOM_OFFSET: [number, number, number] = [-2.41, -0.047, -3.46];

interface AnimeStudioRoomModelProps {
  lightingMode: RoomLighting;
  lampDimFactor?: number;
  isStudying?: boolean;
  isSleeping?: boolean;
  onSelectZone?: (zone: HomeZoneId) => void;
  onClickFloor?: (x: number, z: number) => void;
  onClickFurniture?: (shortcut: FurnitureShortcutId) => void;
}

function resolveGroupTarget(object: THREE.Object3D | null): string | null {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    const name = cur.name || '';
    if (
      name === 'Floor' ||
      name === 'Window' ||
      name === 'Desk' ||
      name === 'Laptop' ||
      name === 'OfficeChair' ||
      name === 'DeskItems' ||
      name === 'StudyShelves' ||
      name === 'CorkboardHeadphones' ||
      name === 'Bed' ||
      name === 'Nightstand' ||
      name === 'Kitchen' ||
      name === 'DiningTable' ||
      name.startsWith('DiningChair') ||
      name === 'Bathroom'
    ) {
      return name;
    }
    cur = cur.parent;
  }
  return null;
}

export const AnimeStudioRoomModel: React.FC<AnimeStudioRoomModelProps> = ({
  lightingMode,
  lampDimFactor = 1,
  isStudying = false,
  isSleeping = false,
  onSelectZone,
  onClickFloor,
  onClickFurniture,
}) => {
  const { scene } = useGLTF(ANIME_STUDIO_GLB_URL);

  const clonedScene = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
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
    return root;
  }, [scene]);

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
            const boost = isStudying ? 1.2 : isNight ? 1.1 : 0.9;
            std.emissiveIntensity = std.userData.__baseEmissive * boost * lampDimFactor;
          }
        }
      }
    });
  }, [clonedScene, lightingMode, lampDimFactor, isStudying, isSleeping]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const target = resolveGroupTarget(e.object);
    if (!target) return;
    e.stopPropagation();

    if (target === 'Floor') {
      onClickFloor?.(e.point.x, e.point.z);
      return;
    }
    if (target === 'Window') {
      onClickFurniture?.('window_speaker');
      return;
    }
    if (target === 'Laptop') {
      onClickFurniture?.('laptop');
      return;
    }
    if (target === 'CorkboardHeadphones' || target === 'StudyShelves') {
      onClickFurniture?.('wall_schedule');
      return;
    }
    if (target === 'Desk' || target === 'OfficeChair' || target === 'DeskItems') {
      onSelectZone?.('study');
      return;
    }
    if (target === 'Bed' || target === 'Nightstand') {
      onSelectZone?.('bedroom');
      return;
    }
    if (target === 'Kitchen') {
      onSelectZone?.('kitchen');
      return;
    }
    if (target === 'DiningTable' || target.startsWith('DiningChair')) {
      onSelectZone?.('dining');
      return;
    }
    if (target === 'Bathroom') {
      onSelectZone?.('washroom');
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (resolveGroupTarget(e.object)) {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  return (
    <group>
      {/* Subtle dark navy plinth under the GLB room */}
      <mesh position={[0, -0.34, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.36, 10.1]} />
        <meshStandardMaterial color="#162040" roughness={0.8} metalness={0.08} />
      </mesh>
      <primitive
        object={clonedScene}
        position={ROOM_OFFSET}
        scale={[ROOM_SCALE, ROOM_SCALE, ROOM_SCALE]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />
    </group>
  );
};

useGLTF.preload(ANIME_STUDIO_GLB_URL);
