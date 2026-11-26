import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RoomLighting } from '../../features/study-room/customization-types.ts';

export type RoomTimeMode = 'morning' | 'afternoon' | 'sunset' | 'night';

interface RoomLightingControllerProps {
  mode: RoomLighting;
  accentColor?: string;
  cycleSeconds?: number;
}

const lightingPresets: Record<
  RoomTimeMode,
  {
    ambient: number;
    directional: number;
    hemi: number;
    ambientColor: string;
    sunColor: string;
    sunPosition: [number, number, number];
  }
> = {
  morning: {
    ambient: 0.95,
    directional: 1.75,
    hemi: 0.75,
    ambientColor: '#e5f0ff',
    sunColor: '#fff0ce',
    sunPosition: [4, 8, 5],
  },
  afternoon: {
    ambient: 0.85,
    directional: 2.0,
    hemi: 0.7,
    ambientColor: '#ffffff',
    sunColor: '#fff8e8',
    sunPosition: [5, 9, 3],
  },
  sunset: {
    ambient: 0.75,
    directional: 1.5,
    hemi: 0.65,
    ambientColor: '#ffe0bd',
    sunColor: '#ffad70',
    sunPosition: [-5, 5, 3],
  },
  night: {
    ambient: 0.68,
    directional: 0.85,
    hemi: 0.6,
    ambientColor: '#8195cc',
    sunColor: '#a5b4fc',
    sunPosition: [-3, 6, -4],
  },
};

const AUTO_SEQUENCE: RoomTimeMode[] = ['morning', 'afternoon', 'sunset', 'night'];

export default function RoomLightingController({
  mode,
  accentColor = '#9585ff',
  cycleSeconds = 48,
}: RoomLightingControllerProps) {
  const ambientRef = useRef<THREE.AmbientLight>(null!);
  const directionalRef = useRef<THREE.DirectionalLight>(null!);

  const ambientTarget = useMemo(() => new THREE.Color(), []);
  const sunTarget = useMemo(() => new THREE.Color(), []);
  const positionTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    const ambient = ambientRef.current;
    const directional = directionalRef.current;
    if (!ambient || !directional) return;

    let activePreset = lightingPresets[mode === 'auto' ? 'afternoon' : mode];

    if (mode === 'auto') {
      const progress = ((clock.getElapsedTime() % cycleSeconds) / cycleSeconds) * AUTO_SEQUENCE.length;
      const idx = Math.floor(progress) % AUTO_SEQUENCE.length;
      activePreset = lightingPresets[AUTO_SEQUENCE[idx]];
    }

    const alpha = 1 - Math.exp(-delta * 2.0);
    ambientTarget.set(activePreset.ambientColor);
    sunTarget.set(activePreset.sunColor);
    positionTarget.set(...activePreset.sunPosition);

    ambient.intensity = THREE.MathUtils.damp(ambient.intensity, activePreset.ambient, 2.0, delta);
    directional.intensity = THREE.MathUtils.damp(
      directional.intensity,
      activePreset.directional,
      2.0,
      delta
    );
    ambient.color.lerp(ambientTarget, alpha);
    directional.color.lerp(sunTarget, alpha);
    directional.position.lerp(positionTarget, alpha);
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.85} />
      <hemisphereLight args={['#dfeaff', '#302b49', 0.68]} />
      <directionalLight
        ref={directionalRef}
        position={[4, 8, 5]}
        intensity={1.65}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-3, 3, 2]} color={accentColor} intensity={0.75} distance={10} />
      <pointLight position={[3, 3, -2]} color="#ffc98b" intensity={0.55} distance={9} />
    </>
  );
}

