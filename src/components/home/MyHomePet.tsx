import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { HomeZoneId } from '../../features/home/homeRoutineEngine.ts';
import type { PetSpecies } from '../../features/home/homeFeaturesEngine.ts';

export interface MyHomePetProps {
  species: PetSpecies;
  hasCollar: boolean;
  hasLuxuryPetBed: boolean;
  activeZone: HomeZoneId;
  isWalking: boolean;
  avatarGroupRef: React.RefObject<THREE.Group | null>;
  streakDays: number;
  isVisiting?: boolean;
  onClickPet?: () => void;
}

const PET_REST_POS = new THREE.Vector3(-2.72, 0.015, -0.78);

export const MyHomePet: React.FC<MyHomePetProps> = ({
  species,
  hasCollar,
  hasLuxuryPetBed,
  activeZone,
  isWalking,
  avatarGroupRef,
  streakDays,
  isVisiting = false,
  onClickPet,
}) => {
  const petGroupRef = useRef<THREE.Group | null>(null);
  const headRef = useRef<THREE.Group | null>(null);
  const tailRef = useRef<THREE.Group | null>(null);
  const bodyRef = useRef<THREE.Group | null>(null);
  const legFLRef = useRef<THREE.Mesh | null>(null);
  const legFRRef = useRef<THREE.Mesh | null>(null);
  const legBLRef = useRef<THREE.Mesh | null>(null);
  const legBRRef = useRef<THREE.Mesh | null>(null);

  const [hovered, setHovered] = useState(false);

  const currentPos = useRef(PET_REST_POS.clone());
  const targetPos = useRef(PET_REST_POS.clone());
  const currentYaw = useRef(0.55);

  const palette = useMemo(() => {
    if (species === 'dog') {
      return {
        primary: '#e08b43', // warm Shiba orange-tan
        secondary: '#fff5e4', // cream chest/snout/paws
        innerEar: '#f3b49b',
        nose: '#1e293b',
        collar: '#0ea5e9',
      };
    }
    return {
      primary: '#f1c27d', // warm honey-ginger tabby
      secondary: '#fff8ee', // cream belly/paws/muzzle
      innerEar: '#f9a8d4',
      nose: '#fb7185',
      collar: '#ec4899',
    };
  }, [species]);

  const shouldCurlAndRest = !isWalking && (activeZone === 'study' || activeZone === 'bedroom');

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const pet = petGroupRef.current;
    if (!pet) return;

    if (shouldCurlAndRest) {
      targetPos.current.copy(PET_REST_POS);
      if (hasLuxuryPetBed) targetPos.current.y = 0.085;
    } else if (avatarGroupRef.current) {
      const av = avatarGroupRef.current.position;
      // Stand politely beside/behind avatar within unobstructed floor space
      const tx = THREE.MathUtils.clamp(av.x + (av.x < 0 ? 0.62 : -0.62), -4.15, 4.15);
      const tz = THREE.MathUtils.clamp(av.z + 0.56, -2.85, 3.6);
      targetPos.current.set(tx, 0.015, tz);
    }

    const dx = targetPos.current.x - currentPos.current.x;
    const dz = targetPos.current.z - currentPos.current.z;
    const dist = Math.hypot(dx, dz);
    const isPetMoving = dist > 0.06;

    if (isPetMoving) {
      const speed = Math.min(dist / Math.max(dt, 0.001), 1.9);
      const step = Math.min(dist, speed * dt);
      currentPos.current.x += (dx / dist) * step;
      currentPos.current.z += (dz / dist) * step;
      currentPos.current.y = THREE.MathUtils.lerp(currentPos.current.y, targetPos.current.y, 1 - Math.exp(-8 * dt));

      const desiredYaw = Math.atan2(dx, dz);
      let diff = desiredYaw - currentYaw.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      currentYaw.current += diff * Math.min(1, 9 * dt);
    } else {
      currentPos.current.y = THREE.MathUtils.lerp(currentPos.current.y, targetPos.current.y, 1 - Math.exp(-8 * dt));
      if (shouldCurlAndRest) {
        const restYaw = 0.65;
        let diff = restYaw - currentYaw.current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        currentYaw.current += diff * Math.min(1, 5 * dt);
      }
    }

    pet.position.copy(currentPos.current);
    pet.rotation.y = currentYaw.current;

    // Procedural posture: curled sleep vs standing trot
    const crouchY = shouldCurlAndRest && !isPetMoving ? -0.09 : isPetMoving ? Math.abs(Math.sin(t * 11)) * 0.025 : 0;
    if (bodyRef.current) {
      bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, 0.21 + crouchY, 1 - Math.exp(-10 * dt));
      const breath = 1 + Math.sin(t * (shouldCurlAndRest ? 2.1 : 3.4)) * 0.035;
      bodyRef.current.scale.set(breath, 1, breath);
    }

    if (headRef.current) {
      if (shouldCurlAndRest && !isPetMoving) {
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0.36 + Math.sin(t * 1.8) * 0.04, 0.12);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, 0.14, 0.1);
      } else {
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, Math.sin(t * 2.5) * 0.05, 0.15);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, Math.sin(t * 1.7) * 0.06, 0.15);
      }
    }

    if (tailRef.current) {
      const wagSpeed = isPetMoving ? 10 : shouldCurlAndRest ? 1.8 : 4.5;
      const wagAmp = isPetMoving ? 0.55 : shouldCurlAndRest ? 0.14 : 0.38;
      tailRef.current.rotation.y = Math.sin(t * wagSpeed) * wagAmp;
      tailRef.current.rotation.x = species === 'dog' ? -0.65 : -0.4 + Math.cos(t * wagSpeed * 0.7) * 0.15;
    }

    const legSwing = isPetMoving ? Math.sin(t * 11) * 0.45 : 0;
    const restFold = shouldCurlAndRest && !isPetMoving ? 0.95 : 0;
    if (legFLRef.current) legFLRef.current.rotation.x = legSwing + restFold;
    if (legBRRef.current) legBRRef.current.rotation.x = legSwing - restFold * 0.7;
    if (legFRRef.current) legFRRef.current.rotation.x = -legSwing + restFold;
    if (legBLRef.current) legBLRef.current.rotation.x = -legSwing - restFold * 0.7;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClickPet?.();
  };

  return (
    <group>
      {/* 30-Day Streak Unlock: Plush Royal Velvet Pet Bed on Rug */}
      {hasLuxuryPetBed && (
        <group position={[PET_REST_POS.x, 0.012, PET_REST_POS.z]}>
          {/* Outer cream bolster ring */}
          <mesh position={[0, 0.055, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.37, 0.4, 0.11, 24]} />
            <meshStandardMaterial color="#e7dec8" roughness={0.88} />
          </mesh>
          {/* Inner midnight velvet cushion */}
          <mesh position={[0, 0.075, 0]} receiveShadow>
            <cylinderGeometry args={[0.28, 0.29, 0.09, 24]} />
            <meshStandardMaterial color="#1e3a8a" roughness={0.82} />
          </mesh>
          {/* Tiny golden paw emblem in front */}
          <mesh position={[0, 0.055, 0.39]} castShadow>
            <boxGeometry args={[0.08, 0.04, 0.015]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
          </mesh>
        </group>
      )}

      {/* Pet Companion Character */}
      <group
        ref={petGroupRef}
        position={[PET_REST_POS.x, PET_REST_POS.y, PET_REST_POS.z]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <group ref={bodyRef} position={[0, 0.21, 0]}>
          {/* Torso */}
          <mesh castShadow receiveShadow>
            <capsuleGeometry args={[0.105, 0.18, 8, 12]} />
            <meshStandardMaterial color={palette.primary} roughness={0.78} />
          </mesh>
          {/* Rotate torso slightly horizontal */}
          {/* Actually keep capsule vertical or rotate child torso mesh: */}
        </group>

        {/* Cleaner Horizontal Quadruped Pet Assembly (synced cleanly under root) */}
        <group position={[0, shouldCurlAndRest ? 0.13 : 0.21, 0]}>
          {/* Horizontal Torso */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <capsuleGeometry args={[0.105, 0.19, 8, 14]} />
            <meshStandardMaterial color={palette.primary} roughness={0.78} />
          </mesh>
          {/* Cream chest */}
          <mesh position={[0, -0.02, 0.11]} castShadow>
            <sphereGeometry args={[0.088, 12, 12]} />
            <meshStandardMaterial color={palette.secondary} roughness={0.82} />
          </mesh>

          {/* 4 Paws / Legs */}
          <mesh ref={legFLRef} position={[-0.065, -0.1, 0.09]} castShadow>
            <cylinderGeometry args={[0.028, 0.024, 0.14, 10]} />
            <meshStandardMaterial color={palette.secondary} roughness={0.8} />
          </mesh>
          <mesh ref={legFRRef} position={[0.065, -0.1, 0.09]} castShadow>
            <cylinderGeometry args={[0.028, 0.024, 0.14, 10]} />
            <meshStandardMaterial color={palette.secondary} roughness={0.8} />
          </mesh>
          <mesh ref={legBLRef} position={[-0.065, -0.1, -0.09]} castShadow>
            <cylinderGeometry args={[0.03, 0.025, 0.14, 10]} />
            <meshStandardMaterial color={palette.primary} roughness={0.8} />
          </mesh>
          <mesh ref={legBRRef} position={[0.065, -0.1, -0.09]} castShadow>
            <cylinderGeometry args={[0.03, 0.025, 0.14, 10]} />
            <meshStandardMaterial color={palette.primary} roughness={0.8} />
          </mesh>

          {/* 7-Day+ Streak Unlock: Collar + Golden Bell */}
          {hasCollar && (
            <group position={[0, 0.04, 0.13]} rotation={[0.45, 0, 0]}>
              <mesh>
                <torusGeometry args={[0.085, 0.017, 10, 20]} />
                <meshStandardMaterial color={palette.collar} roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.08, 0.02]}>
                <sphereGeometry args={[0.024, 12, 12]} />
                <meshStandardMaterial
                  color="#fbbf24"
                  emissive={hasLuxuryPetBed ? '#f59e0b' : '#000000'}
                  emissiveIntensity={hasLuxuryPetBed ? 0.5 : 0}
                  metalness={0.85}
                  roughness={0.2}
                />
              </mesh>
            </group>
          )}

          {/* Head */}
          <group ref={headRef} position={[0, 0.12, 0.16]}>
            <mesh castShadow>
              <sphereGeometry args={[0.105, 16, 16]} />
              <meshStandardMaterial color={palette.primary} roughness={0.76} />
            </mesh>
            {/* Muzzle */}
            <mesh position={[0, -0.025, species === 'dog' ? 0.09 : 0.078]} castShadow>
              <sphereGeometry args={[species === 'dog' ? 0.052 : 0.044, 12, 12]} />
              <meshStandardMaterial color={palette.secondary} roughness={0.8} />
            </mesh>
            {/* Nose */}
            <mesh position={[0, -0.01, species === 'dog' ? 0.138 : 0.116]}>
              <sphereGeometry args={[0.016, 10, 10]} />
              <meshStandardMaterial color={palette.nose} roughness={0.35} />
            </mesh>
            {/* Glossy Eyes */}
            <mesh position={[-0.042, 0.022, 0.086]}>
              <sphereGeometry args={[0.016, 10, 10]} />
              <meshStandardMaterial color="#0f172a" roughness={0.18} />
            </mesh>
            <mesh position={[0.042, 0.022, 0.086]}>
              <sphereGeometry args={[0.016, 10, 10]} />
              <meshStandardMaterial color="#0f172a" roughness={0.18} />
            </mesh>
            {/* Ears */}
            <group position={[-0.068, 0.095, 0.01]} rotation={[0.1, 0, 0.25]}>
              <mesh castShadow>
                <coneGeometry args={[0.036, 0.075, 4]} />
                <meshStandardMaterial color={palette.primary} roughness={0.75} />
              </mesh>
              <mesh position={[0, -0.005, 0.012]}>
                <coneGeometry args={[0.02, 0.045, 4]} />
                <meshStandardMaterial color={palette.innerEar} roughness={0.8} />
              </mesh>
            </group>
            <group position={[0.068, 0.095, 0.01]} rotation={[0.1, 0, -0.25]}>
              <mesh castShadow>
                <coneGeometry args={[0.036, 0.075, 4]} />
                <meshStandardMaterial color={palette.primary} roughness={0.75} />
              </mesh>
              <mesh position={[0, -0.005, 0.012]}>
                <coneGeometry args={[0.02, 0.045, 4]} />
                <meshStandardMaterial color={palette.innerEar} roughness={0.8} />
              </mesh>
            </group>
          </group>

          {/* Tail */}
          <group ref={tailRef} position={[0, 0.04, -0.15]}>
            <mesh position={[0, 0.07, -0.04]} rotation={[-0.5, 0, 0]} castShadow>
              <capsuleGeometry args={[0.024, species === 'cat' ? 0.17 : 0.11, 6, 10]} />
              <meshStandardMaterial color={palette.primary} roughness={0.78} />
            </mesh>
          </group>
        </group>

        {/* Subtle resting badge or hover tag */}
        {(hovered || (shouldCurlAndRest && !isWalking)) && (
          <Html position={[0, 0.56, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
            <div className="px-2 py-0.5 rounded-full bg-slate-950/85 border border-amber-300/35 text-[10px] font-medium text-amber-100 whitespace-nowrap shadow-md backdrop-blur-sm">
              {hovered
                ? isVisiting
                  ? `${species === 'cat' ? '🐈 Cat' : '🐕 Shiba'} · ${streakDays}d Streak`
                  : `${species === 'cat' ? '🐈 Mochi (Click to switch)' : '🐕 Kibo (Click to switch)'}`
                : '🐾 💤'}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
};

