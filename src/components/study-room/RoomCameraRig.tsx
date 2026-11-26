import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import * as THREE from 'three';

export type RoomCameraMode = 'isometric' | 'free' | 'cinematic' | 'desk_pov' | 'observatory';

type Vector3Tuple = [number, number, number];

interface RoomCameraRigProps {
  mode: RoomCameraMode;
  focusTarget?: Vector3Tuple | null;
  followEnabled?: boolean;
  followRef?: React.MutableRefObject<Vector3Tuple | null>;
  autoOrbit?: boolean;
  resetCounter?: number;
  minDistance?: number;
  presetsOverride?: Partial<Record<RoomCameraMode, { position: Vector3Tuple; target: Vector3Tuple }>>;
  onCameraMove?: () => void;
}

const defaultPresets: Record<RoomCameraMode, { position: Vector3Tuple; target: Vector3Tuple }> = {
  isometric: {
    position: [7.5, 7.8, 9.8],
    target: [0, 0.7, 0],
  },
  free: {
    position: [0, 5.4, 9.2],
    target: [0, 0.7, 0],
  },
  cinematic: {
    position: [5.4, 4.0, 8.2],
    target: [0, 0.9, -0.3],
  },
  desk_pov: {
    position: [-3.35, 1.34, 1.07],
    target: [-4.55, 1.04, 0.92],
  },
  observatory: {
    position: [-5.4, 1.85, 2.2],
    target: [-3.8, 4.7, -5.8],
  },
};

export default function RoomCameraRig({
  mode,
  focusTarget,
  followEnabled = false,
  followRef,
  autoOrbit = false,
  resetCounter = 0,
  minDistance = 3.2,
  presetsOverride,
  onCameraMove,
}: RoomCameraRigProps) {
  const controlsRef = useRef<React.ComponentRef<typeof CameraControls>>(null);
  const smoothedLook = useRef(new THREE.Vector3(0, 0.85, 0));

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || followEnabled) return;

    if (focusTarget) {
      const [x, y, z] = focusTarget;
      const offsetZ = z >= 0 ? -3.4 : 3.4;
      void controls.setLookAt(x + 1.4, y + 2.1, z + offsetZ, x, y + 0.9, z, true);
      return;
    }

    const preset = presetsOverride?.[mode] || defaultPresets[mode];
    void controls.setLookAt(...preset.position, ...preset.target, true);
  }, [
    mode,
    followEnabled,
    focusTarget?.[0],
    focusTarget?.[1],
    focusTarget?.[2],
    resetCounter,
    presetsOverride,
  ]);

  useEffect(() => {
    if (followEnabled && followRef?.current) {
      const [fx, fy, fz] = followRef.current;
      smoothedLook.current.set(fx, fy + 0.85, fz);
      const controls = controlsRef.current;
      if (controls) {
        void controls.setLookAt(fx + 3.2, fy + 3.6, fz + 4.4, fx, fy + 0.85, fz, true);
      }
    }
  }, [followEnabled, resetCounter]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (followEnabled && followRef?.current) {
      const [fx, fy, fz] = followRef.current;
      const alpha = 1 - Math.exp(-delta * 5.0);
      smoothedLook.current.x = THREE.MathUtils.lerp(smoothedLook.current.x, fx, alpha);
      smoothedLook.current.y = THREE.MathUtils.lerp(smoothedLook.current.y, fy + 0.85, alpha);
      smoothedLook.current.z = THREE.MathUtils.lerp(smoothedLook.current.z, fz, alpha);
      const lx = smoothedLook.current.x;
      const ly = smoothedLook.current.y;
      const lz = smoothedLook.current.z;
      void controls.setLookAt(lx + 3.2, ly + 2.75, lz + 4.4, lx, ly, lz, false);
      return;
    }

    if (focusTarget) return;

    if (mode === 'cinematic') {
      void controls.rotate(delta * 0.08, 0, false);
    } else if (autoOrbit && mode === 'free') {
      void controls.rotate(delta * 0.11, 0, false);
    }
  });

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={minDistance}
      maxDistance={19}
      maxPolarAngle={Math.PI / 2.06}
      minPolarAngle={0.2}
      smoothTime={0.45}
      onStart={() => onCameraMove?.()}
    />
  );
}
