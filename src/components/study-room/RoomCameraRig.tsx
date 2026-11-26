import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';

export type RoomCameraMode = 'isometric' | 'free' | 'cinematic';

type Vector3Tuple = [number, number, number];

interface RoomCameraRigProps {
  mode: RoomCameraMode;
  focusTarget?: Vector3Tuple | null;
  autoOrbit?: boolean;
  resetCounter?: number;
  onCameraMove?: () => void;
}

const presets: Record<RoomCameraMode, { position: Vector3Tuple; target: Vector3Tuple }> = {
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
};

export default function RoomCameraRig({
  mode,
  focusTarget,
  autoOrbit = false,
  resetCounter = 0,
  onCameraMove,
}: RoomCameraRigProps) {
  const controlsRef = useRef<React.ComponentRef<typeof CameraControls>>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (focusTarget) {
      const [x, y, z] = focusTarget;
      const offsetZ = z >= 0 ? -3.4 : 3.4;
      void controls.setLookAt(x + 1.4, y + 2.1, z + offsetZ, x, y + 0.9, z, true);
      return;
    }

    const preset = presets[mode];
    void controls.setLookAt(...preset.position, ...preset.target, true);
  }, [mode, focusTarget?.[0], focusTarget?.[1], focusTarget?.[2], resetCounter]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || focusTarget) return;

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
      minDistance={3.2}
      maxDistance={17}
      maxPolarAngle={Math.PI / 2.06}
      minPolarAngle={0.2}
      smoothTime={0.45}
      onStart={() => onCameraMove?.()}
    />
  );
}

