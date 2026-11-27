import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { HomeZoneId } from '../../features/home/homeRoutineEngine.ts';
import type { RoomLighting } from '../../features/study-room/customization-types.ts';

const COZY_VILLA_GLB_URL = '/models/cozy-home-cutaway.glb';
const VILLA_SCALE = 0.85;
const VILLA_OFFSET: [number, number, number] = [0.2, 0, 0];

interface CozyVillaRoomModelProps {
  lightingMode: RoomLighting;
  lampDimFactor?: number;
  isStudying?: boolean;
  isSleeping?: boolean;
  onSelectZone?: (zone: HomeZoneId) => void;
  onClickFloor?: (x: number, z: number) => void;
}

function resolveVillaTarget(object: THREE.Object3D | null): string | null {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    const name = cur.name || '';
    if (
      name === 'StudyFurniture' ||
      name === 'BedroomFurniture' ||
      name === 'LivingFurniture' ||
      name === 'KitchenFurniture' ||
      name === 'BathroomFurniture' ||
      name === 'HouseStructure'
    ) {
      return name;
    }
    cur = cur.parent;
  }
  return null;
}

export const CozyVillaRoomModel: React.FC<CozyVillaRoomModelProps> = ({
  lightingMode,
  lampDimFactor = 1,
  isStudying = false,
  isSleeping = false,
  onSelectZone,
  onClickFloor,
}) => {
  const { scene } = useGLTF(COZY_VILLA_GLB_URL);
  const clockHourRef = useRef<THREE.Object3D | null>(null);
  const clockMinRef = useRef<THREE.Object3D | null>(null);
  const canopyRefs = useRef<THREE.Object3D[]>([]);

  const clonedScene = useMemo(() => {
    const root = scene.clone(true);
    const canopies: THREE.Object3D[] = [];
    clockHourRef.current = null;
    clockMinRef.current = null;

    root.traverse((obj) => {
      if (obj.name === 'ClockHourPivot') clockHourRef.current = obj;
      if (obj.name === 'ClockMinutePivot') clockMinRef.current = obj;
      if (obj.name === 'TreeCanopyPivot' || obj.name === 'StudyVineSwayPivot') {
        canopies.push(obj);
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
  }, [scene]);

  const tzOffsetMs = useMemo(() => -new Date().getTimezoneOffset() * 60_000, []);

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
            const boost = isStudying ? 1.15 : isNight ? 1.1 : 0.9;
            std.emissiveIntensity = std.userData.__baseEmissive * boost * lampDimFactor;
          }
        }
      }
    });
  }, [clonedScene, lightingMode, lampDimFactor, isStudying, isSleeping]);

  useFrame(({ clock }) => {
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
    const target = resolveVillaTarget(e.object);
    if (!target) return;
    e.stopPropagation();

    if (target === 'StudyFurniture') {
      onSelectZone?.('study');
      return;
    }
    if (target === 'BedroomFurniture') {
      onSelectZone?.('bedroom');
      return;
    }
    if (target === 'LivingFurniture') {
      onSelectZone?.('dining');
      return;
    }
    if (target === 'KitchenFurniture') {
      onSelectZone?.('kitchen');
      return;
    }
    if (target === 'BathroomFurniture') {
      onSelectZone?.('washroom');
      return;
    }
    if (target === 'HouseStructure') {
      onClickFloor?.(e.point.x, e.point.z);
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (resolveVillaTarget(e.object)) {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  return (
    <primitive
      object={clonedScene}
      position={VILLA_OFFSET}
      scale={[VILLA_SCALE, VILLA_SCALE, VILLA_SCALE]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
};


