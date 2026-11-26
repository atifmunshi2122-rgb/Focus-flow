import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RoomWeather } from '../../features/study-room/customization-types.ts';

interface RoomWeatherEffectsProps {
  weather: RoomWeather;
  ambientEffects: boolean;
}

export default function RoomWeatherEffects({
  weather,
  ambientEffects,
}: RoomWeatherEffectsProps) {
  const weatherRef = useRef<THREE.Points>(null);
  const dustRef = useRef<THREE.Points>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const particleCount = weather === 'clear' ? 0 : isMobile ? 80 : 160;
  const dustCount = ambientEffects ? (isMobile ? 25 : 45) : 0;

  // Weather particles strictly outside the back window (z between -4.6 and -6.2)
  const weatherGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (particleCount === 0) return geo;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4.4;
      positions[i * 3 + 1] = 0.6 + Math.random() * 3.8;
      positions[i * 3 + 2] = -4.55 - Math.random() * 1.4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [particleCount, weather]);

  // Subtle indoor floating sunlight dust motes
  const dustGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (dustCount === 0) return geo;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 9.5;
      positions[i * 3 + 1] = 0.5 + Math.random() * 3.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [dustCount]);

  useEffect(() => {
    return () => {
      weatherGeo.dispose();
    };
  }, [weatherGeo]);

  useEffect(() => {
    return () => {
      dustGeo.dispose();
    };
  }, [dustGeo]);

  useFrame(({ clock }, delta) => {
    if (weatherRef.current && particleCount > 0) {
      const posAttr = weatherRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const speedY = weather === 'rain' ? 6.5 : 1.15;
      const driftX = weather === 'rain' ? -0.35 : Math.sin(clock.getElapsedTime() * 0.9) * 0.3;

      for (let i = 0; i < particleCount; i++) {
        arr[i * 3 + 1] -= speedY * delta;
        arr[i * 3] += driftX * delta;
        if (arr[i * 3 + 1] < 0.4) {
          arr[i * 3 + 1] = 4.3;
          arr[i * 3] = (Math.random() - 0.5) * 4.4;
        }
      }
      posAttr.needsUpdate = true;
    }

    if (dustRef.current && dustCount > 0) {
      const posAttr = dustRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const t = clock.getElapsedTime();
      for (let i = 0; i < dustCount; i++) {
        arr[i * 3 + 1] += Math.sin(t + i) * 0.0012;
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      {particleCount > 0 && (
        <points ref={weatherRef} geometry={weatherGeo}>
          <pointsMaterial
            color={weather === 'rain' ? '#93c5fd' : '#f8fafc'}
            size={weather === 'rain' ? 0.055 : 0.085}
            transparent
            opacity={weather === 'rain' ? 0.65 : 0.85}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      )}

      {dustCount > 0 && (
        <points ref={dustRef} geometry={dustGeo}>
          <pointsMaterial
            color="#fde68a"
            size={0.04}
            transparent
            opacity={0.35}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}

