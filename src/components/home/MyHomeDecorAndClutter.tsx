import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { HomeDecorUnlocks } from '../../features/home/homeFeaturesEngine.ts';

/**
 * Dynamic Study Desk clutter props that appear deterministically when
 * overdue tasks or unpaid bills accumulate, and vanish when cleared.
 */
export const StudyDeskClutter: React.FC<{ clutterLevel: 0 | 1 | 2 | 3 }> = ({ clutterLevel }) => {
  if (clutterLevel <= 0) return null;

  return (
    <group>
      {/* Level 1+: Scattered skewed papers + manila bill envelope + sticky notes */}
      <group position={[-4.2, 0.782, 0.56]}>
        <mesh position={[0, 0.008, 0]} rotation={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[0.21, 0.012, 0.27]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.88} />
        </mesh>
        <mesh position={[0.02, 0.018, -0.02]} rotation={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.19, 0.01, 0.25]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
        </mesh>
        <mesh position={[-0.03, 0.026, 0.03]} rotation={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.16, 0.006, 0.2]} />
          <meshStandardMaterial color="#fef08a" roughness={0.85} />
        </mesh>
      </group>

      <group position={[-4.24, 0.782, 1.56]} rotation={[0, -0.35, 0]}>
        {/* Unpaid bills manila envelope */}
        <mesh position={[0, 0.008, 0]} castShadow>
          <boxGeometry args={[0.24, 0.014, 0.16]} />
          <meshStandardMaterial color="#d97706" roughness={0.78} />
        </mesh>
        <mesh position={[0.01, 0.018, 0]} rotation={[0, 0.14, 0]} castShadow>
          <boxGeometry args={[0.2, 0.006, 0.13]} />
          <meshStandardMaterial color="#fee2e2" roughness={0.85} />
        </mesh>
      </group>

      {/* Level 2+: Takeout coffee cup + uneven thick red overdue folder */}
      {clutterLevel >= 2 && (
        <group>
          <group position={[-4.5, 0.782, 1.48]} rotation={[0, 0.28, 0]}>
            <mesh position={[0, 0.018, 0]} castShadow>
              <boxGeometry args={[0.24, 0.032, 0.3]} />
              <meshStandardMaterial color="#b91c1c" roughness={0.7} />
            </mesh>
            <mesh position={[0.02, 0.042, 0.02]} rotation={[0, -0.22, 0]} castShadow>
              <boxGeometry args={[0.21, 0.014, 0.26]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.88} />
            </mesh>
          </group>

          {/* Leftover ceramic/takeout mug */}
          <group position={[-4.18, 0.782, 1.74]}>
            <mesh position={[0, 0.055, 0]} castShadow>
              <cylinderGeometry args={[0.042, 0.034, 0.11, 14]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.112, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.014, 14]} />
              <meshStandardMaterial color="#78350f" roughness={0.5} />
            </mesh>
          </group>
        </group>
      )}

      {/* Level 3: Extra leaning papers & crumpled paper balls beside desk */}
      {clutterLevel >= 3 && (
        <group>
          <group position={[-4.16, 0.805, 1.66]} rotation={[0.06, -0.5, -0.05]}>
            <mesh castShadow>
              <boxGeometry args={[0.2, 0.036, 0.25]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.85} />
            </mesh>
          </group>
          <mesh position={[-3.95, 0.036, 1.88]} castShadow>
            <dodecahedronGeometry args={[0.038, 0]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.92} />
          </mesh>
          <mesh position={[-3.82, 0.032, 1.72]} rotation={[0.6, 0.4, 0]} castShadow>
            <dodecahedronGeometry args={[0.032, 0]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.92} />
          </mesh>
        </group>
      )}
    </group>
  );
};

/**
 * XP & Savings-Milestone 3D Decor Upgrades anchored cleanly onto the apartment.
 */
export const MyHomeUnlockedDecor: React.FC<{
  unlocks: HomeDecorUnlocks;
  kitchenGroupPosition: [number, number, number];
  chairGroupPosition: [number, number, number];
  chairRotationY: number;
  deskOffsetY?: number;
}> = ({ unlocks, kitchenGroupPosition, chairGroupPosition, chairRotationY, deskOffsetY = 0 }) => {
  return (
    <group>
      {/* 1. Mechanical RGB Keyboard & Mouse Mat (200 XP or Lv 2) */}
      <group position={[0, deskOffsetY, 0]}>
      {unlocks.mechKeyboard && (
        <group position={[-4.12, 0.782, 1.07]}>
          {/* Matte obsidian desk pad */}
          <mesh position={[0, 0.003, 0]} receiveShadow>
            <boxGeometry args={[0.26, 0.006, 0.72]} />
            <meshStandardMaterial color="#0f172a" roughness={0.85} />
          </mesh>
          {/* Compact 65% mechanical keyboard */}
          <mesh position={[0, 0.016, -0.08]} castShadow>
            <boxGeometry args={[0.135, 0.022, 0.34]} />
            <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.25} />
          </mesh>
          {/* Subtle RGB underglow trim */}
          <mesh position={[0, 0.009, -0.08]}>
            <boxGeometry args={[0.141, 0.006, 0.348]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#38bdf8"
              emissiveIntensity={1.25}
              roughness={0.3}
            />
          </mesh>
          {/* Wireless ergonomic mouse */}
          <mesh position={[0.01, 0.018, 0.22]} castShadow>
            <boxGeometry args={[0.085, 0.024, 0.055]} />
            <meshStandardMaterial color="#334155" roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* 2. Dual External Monitor on Arm (Lv 2 or 25% Savings) */}
      {unlocks.dualMonitor && (
        <group position={[-4.64, 0.78, 0.52]} rotation={[0, 0.28, 0]}>
          {/* Clamp arm + pole */}
          <mesh position={[-0.12, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.026, 0.48, 12]} />
            <meshStandardMaterial color="#1f2937" metalness={0.65} roughness={0.3} />
          </mesh>
          <mesh position={[-0.04, 0.38, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.16, 10]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.35} />
          </mesh>
          {/* Widescreen monitor bezel */}
          <mesh position={[0.02, 0.41, 0]} castShadow>
            <boxGeometry args={[0.028, 0.34, 0.58]} />
            <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.4} />
          </mesh>
          {/* Luminous telemetry display screen */}
          <mesh position={[0.036, 0.41, 0]}>
            <boxGeometry args={[0.006, 0.3, 0.54]} />
            <meshStandardMaterial
              color="#1e293b"
              emissive="#6366f1"
              emissiveIntensity={0.75}
              roughness={0.22}
            />
          </mesh>
          {/* Neon chart accent strip */}
          <mesh position={[0.04, 0.39, -0.06]}>
            <boxGeometry args={[0.004, 0.14, 0.22]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#38bdf8"
              emissiveIntensity={1.1}
            />
          </mesh>
        </group>
      )}
      </group>

      {/* 3. Fairy Lights String Along Walls (Lv 3, 50% Savings, or 7d Streak) */}
      {unlocks.fairyLights && (
        <group>
          {/* Back wall fairy string above Mt. Fuji headboard */}
          {[-3.35, -3.0, -2.65, -2.3, -1.95, -1.6, -1.25, -0.9].map((fx, i) => {
            const sag = Math.sin((i / 7) * Math.PI) * 0.12;
            return (
              <mesh key={`fb-${i}`} position={[fx, 2.74 - sag, -3.41]}>
                <sphereGeometry args={[0.024, 10, 10]} />
                <meshStandardMaterial
                  color="#fef3c7"
                  emissive="#fbbf24"
                  emissiveIntensity={1.75}
                  roughness={0.2}
                />
              </mesh>
            );
          })}
          {/* Left wall fairy string above study shelves */}
          {[0.55, 0.85, 1.15, 1.45, 1.75, 2.05, 2.35].map((fz, i) => {
            const sag = Math.sin((i / 6) * Math.PI) * 0.1;
            return (
              <mesh key={`fl-${i}`} position={[-4.95, 2.92 - sag, fz]}>
                <sphereGeometry args={[0.022, 10, 10]} />
                <meshStandardMaterial
                  color="#fde68a"
                  emissive="#f59e0b"
                  emissiveIntensity={1.65}
                  roughness={0.2}
                />
              </mesh>
            );
          })}
          <pointLight position={[-2.15, 2.68, -3.0]} color="#fde68a" intensity={0.48} distance={3.2} decay={2} />
        </group>
      )}

      {/* 4. Espresso Bar Upgrade on Kitchen Counter (Lv 4 or 50% Savings) */}
      {unlocks.espressoUpgrade && (
        <group position={[kitchenGroupPosition[0] + 0.43, kitchenGroupPosition[1] + 0.93, kitchenGroupPosition[2] + 0.02]}>
          {/* Brushed stainless dual-group espresso body */}
          <mesh position={[0, 0.14, -0.03]} castShadow>
            <boxGeometry args={[0.2, 0.28, 0.22]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.82} roughness={0.22} />
          </mesh>
          {/* Matte black drip tray base */}
          <mesh position={[0, 0.02, 0.08]} castShadow>
            <boxGeometry args={[0.2, 0.038, 0.1]} />
            <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.3} />
          </mesh>
          {/* Brass grouphead & handle */}
          <mesh position={[0, 0.16, 0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.045, 12]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.16, 0.145]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.08, 10]} />
            <meshStandardMaterial color="#451a03" roughness={0.6} />
          </mesh>
          {/* Twin espresso demitasse cups */}
          {[-0.04, 0.04].map((cx, idx) => (
            <mesh key={idx} position={[cx, 0.06, 0.09]} castShadow>
              <cylinderGeometry args={[0.021, 0.016, 0.044, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.25} />
            </mesh>
          ))}
        </group>
      )}

      {/* 5. Pro Ergo Racing / Gaming Chair Upgrade (Lv 5 or 100% Savings Goal) */}
      {unlocks.gamingChair && (
        <group position={chairGroupPosition} rotation={[0, chairRotationY, 0]}>
          {/* Winged headrest pillow with sky-cyan trim */}
          <mesh position={[0, 0.99, -0.22]} castShadow>
            <boxGeometry args={[0.28, 0.14, 0.08]} />
            <meshStandardMaterial color="#0f172a" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.99, -0.178]}>
            <boxGeometry args={[0.24, 0.04, 0.012]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.55} roughness={0.35} />
          </mesh>
          {/* Side winged bolsters */}
          {[-0.22, 0.22].map((bx, i) => (
            <mesh key={i} position={[bx, 0.72, -0.18]} rotation={[0, bx < 0 ? 0.28 : -0.28, 0]} castShadow>
              <boxGeometry args={[0.06, 0.44, 0.1]} />
              <meshStandardMaterial color="#1e293b" roughness={0.5} />
            </mesh>
          ))}
          {/* Lumbar cushion */}
          <mesh position={[0, 0.56, -0.16]} castShadow>
            <boxGeometry args={[0.26, 0.12, 0.07]} />
            <meshStandardMaterial color="#0284c7" roughness={0.6} />
          </mesh>
        </group>
      )}

      {/* 6. Extra Indoor Plants (Botanical Upgrade — Lv 2, 25% Savings, or 5d Streak) */}
      {unlocks.extraPlants && (
        <group>
          {/* Tall Monstera ceramic pot beside low bookcase console */}
          <group position={[-1.08, 0, 2.94]}>
            <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.17, 0.13, 0.36, 16]} />
              <meshStandardMaterial color="#f5f0e6" roughness={0.62} />
            </mesh>
            {[
              [0, 0.52, 0, 0, 0.36],
              [-0.14, 0.46, 0.09, 0.5, 0.32],
              [0.14, 0.48, -0.07, -0.45, 0.32],
              [-0.1, 0.44, -0.12, -0.4, 0.28],
              [0.11, 0.5, 0.11, 0.4, 0.3],
            ].map(([lx, ly, lz, rot, s], idx) => (
              <mesh
                key={idx}
                position={[lx, ly, lz]}
                rotation={[rot, idx * 1.15, rot * 0.6]}
                scale={[s, s * 1.4, s * 0.4]}
                castShadow
              >
                <sphereGeometry args={[0.5, 10, 10]} />
                <meshStandardMaterial color={idx % 2 === 0 ? '#15803d' : '#22c55e'} roughness={0.55} />
              </mesh>
            ))}
          </group>

          {/* Hanging trailing Pothos near left window upper frame */}
          <group position={[-4.82, 2.75, -1.78]}>
            <mesh position={[0, 0.16, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.32, 8]} />
              <meshStandardMaterial color="#475569" roughness={0.6} />
            </mesh>
            <mesh castShadow>
              <cylinderGeometry args={[0.11, 0.08, 0.16, 14]} />
              <meshStandardMaterial color="#e7dec8" roughness={0.68} />
            </mesh>
            {[0, 1, 2, 3].map((v) => (
              <mesh key={v} position={[0.06, -0.08 - v * 0.11, 0.03 * (v % 2 === 0 ? 1 : -1)]}>
                <sphereGeometry args={[0.052, 8, 8]} />
                <meshStandardMaterial color="#4ade80" roughness={0.58} />
              </mesh>
            ))}
          </group>
        </group>
      )}
    </group>
  );
};

interface RainDropSeed {
  x: number;
  y: number;
  z: number;
  speed: number;
  length: number;
}

/**
 * Animated rain droplets streaking cleanly outside the Left Wall window (`x = -5.28..-6.3`).
 */
export const MyHomeWindowRain: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const groupRef = useRef<THREE.Group | null>(null);

  const drops = useMemo<RainDropSeed[]>(() => {
    const out: RainDropSeed[] = [];
    for (let i = 0; i < 64; i += 1) {
      // Deterministic pseudo-random spread outside Left Wall window
      const s1 = ((i * 73) % 100) / 100;
      const s2 = ((i * 37) % 100) / 100;
      const s3 = ((i * 91) % 100) / 100;
      out.push({
        x: -5.3 - s1 * 1.15,
        y: 0.4 + s2 * 3.1,
        z: -1.85 + s3 * 2.95,
        speed: 4.8 + (i % 5) * 0.65,
        length: 0.22 + (i % 4) * 0.06,
      });
    }
    return out;
  }, []);

  useFrame((_, delta) => {
    if (!enabled || !groupRef.current) return;
    const dt = Math.min(delta, 0.05);
    const children = groupRef.current.children;
    for (let i = 0; i < children.length; i += 1) {
      const mesh = children[i];
      const seed = drops[i];
      if (!seed) continue;
      mesh.position.y -= seed.speed * dt;
      mesh.position.z -= 0.45 * dt;
      if (mesh.position.y < 0.35) {
        mesh.position.y = 3.55;
        mesh.position.z = seed.z;
      }
    }
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef}>
      {drops.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} rotation={[0.14, 0, 0]}>
          <boxGeometry args={[0.012, d.length, 0.012]} />
          <meshStandardMaterial
            color="#93c5fd"
            emissive="#60a5fa"
            emissiveIntensity={0.45}
            transparent
            opacity={0.55}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
};
