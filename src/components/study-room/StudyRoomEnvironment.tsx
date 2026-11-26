/**
 * FocusFlow & Finance — Premium 3D Study Room Environment (Phase 4)
 *
 * Anime-inspired lo-fi / dark-academia multiplayer study interior supporting:
 * - 6 real 3D Room Themes (cozy, minimal, academia, neon, sakura, midnight)
 * - 4 Desk Styles (wood, modern, dark, neon)
 * - 3 Chair Styles (modern, gaming, classic)
 * - Toggles for indoor plants, wall clock/bookshelves/decorations, and window sky
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import type { RankedLeaderboardEntry } from '../../types/leaderboard.ts';
import {
  defaultRoomCustomization,
  ROOM_THEME_PALETTES,
  type ChairStyle,
  type DeskStyle,
  type RoomCustomization,
} from '../../features/study-room/customization-types.ts';

export const DESK_SLOTS: Array<{ x: number; z: number; rotY: number }> = [
  { x: -3.45, z: -1.65, rotY: 0 },
  { x: -1.15, z: -1.65, rotY: 0 },
  { x: 1.15, z: -1.65, rotY: 0 },
  { x: 3.45, z: -1.65, rotY: 0 },
  { x: -3.45, z: 1.85, rotY: Math.PI },
  { x: -1.15, z: 1.85, rotY: Math.PI },
  { x: 1.15, z: 1.85, rotY: Math.PI },
  { x: 3.45, z: 1.85, rotY: Math.PI },
];

const BOOK_COLORS = ['#8e647a', '#547c92', '#d5a56c', '#6366f1', '#10b981', '#f59e0b'];

const DESK_MATERIALS: Record<DeskStyle, { top: string; leg: string; mat: string; edgeGlow?: string }> = {
  wood: { top: '#75513f', leg: '#342a26', mat: '#1e293b' },
  modern: { top: '#e2e8f0', leg: '#64748b', mat: '#334155' },
  dark: { top: '#3b2b26', leg: '#1c1917', mat: '#0f172a' },
  neon: { top: '#1e1b4b', leg: '#090d16', mat: '#312e81', edgeGlow: '#22d3ee' },
};

const CHAIR_MATERIALS: Record<ChairStyle, { seat: string; accent: string; base: string }> = {
  modern: { seat: '#59668c', accent: '#3b4259', base: '#454c60' },
  gaming: { seat: '#1e293b', accent: '#ec4899', base: '#0f172a' },
  classic: { seat: '#6b4238', accent: '#4a2c24', base: '#3b231d' },
};

interface DeskStationProps {
  position: [number, number, number];
  rotationY: number;
  isLive: boolean;
  isSelected: boolean;
  deskStyle: DeskStyle;
  showDecorations: boolean;
  onSelect?: () => void;
}

function DeskStation({
  position,
  rotationY,
  isLive,
  isSelected,
  deskStyle,
  showDecorations,
  onSelect,
}: DeskStationProps) {
  const matCfg = DESK_MATERIALS[deskStyle] || DESK_MATERIALS.wood;

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={(e) => {
        if (onSelect) {
          e.stopPropagation();
          onSelect();
        }
      }}
    >
      {/* Desk Top */}
      <RoundedBox
        args={[1.72, 0.1, 0.88]}
        radius={0.04}
        smoothness={4}
        position={[0, 0.78, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={isSelected ? '#5b56a8' : matCfg.top}
          roughness={deskStyle === 'modern' ? 0.35 : 0.55}
          metalness={deskStyle === 'neon' ? 0.25 : 0.04}
        />
      </RoundedBox>

      {/* Neon Desk Edge Accent */}
      {matCfg.edgeGlow && (
        <mesh position={[0, 0.78, 0.445]}>
          <boxGeometry args={[1.64, 0.024, 0.015]} />
          <meshStandardMaterial
            color={matCfg.edgeGlow}
            emissive={matCfg.edgeGlow}
            emissiveIntensity={0.95}
          />
        </mesh>
      )}

      {/* Subtle Desk Mat */}
      <RoundedBox args={[0.92, 0.015, 0.48]} radius={0.007} position={[0, 0.835, 0.05]}>
        <meshStandardMaterial color={matCfg.mat} roughness={0.85} />
      </RoundedBox>

      {/* Desk Legs */}
      {[-0.72, 0.72].map((x) =>
        [-0.33, 0.33].map((z) => (
          <RoundedBox
            key={`${x}-${z}`}
            args={[0.08, 0.75, 0.08]}
            radius={0.025}
            position={[x, 0.375, z]}
            castShadow
          >
            <meshStandardMaterial color={matCfg.leg} roughness={0.65} />
          </RoundedBox>
        ))
      )}

      {/* Laptop Base */}
      <RoundedBox args={[0.64, 0.032, 0.42]} radius={0.015} position={[0, 0.855, -0.06]} castShadow>
        <meshStandardMaterial color="#343c4e" metalness={0.75} roughness={0.3} />
      </RoundedBox>

      {/* Laptop Screen Lid */}
      <RoundedBox
        args={[0.64, 0.44, 0.032]}
        radius={0.015}
        position={[0, 1.07, -0.26]}
        rotation={[-0.14, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#20283a" metalness={0.6} roughness={0.25} />
      </RoundedBox>

      {/* Laptop Display */}
      <mesh position={[0, 1.07, -0.24]} rotation={[-0.14, 0, 0]}>
        <planeGeometry args={[0.56, 0.36]} />
        <meshStandardMaterial
          color={isLive ? '#89c4ff' : '#0f172a'}
          emissive={isLive ? '#4e84e6' : '#000000'}
          emissiveIntensity={isLive ? 0.65 : 0}
        />
      </mesh>

      {/* Study Accessories (Books, Notebook, Mug) */}
      {showDecorations && (
        <>
          <RoundedBox args={[0.26, 0.02, 0.19]} radius={0.008} position={[-0.48, 0.845, 0.14]} rotation={[0, 0.18, 0]}>
            <meshStandardMaterial color="#f8fafc" roughness={0.85} />
          </RoundedBox>
          <mesh position={[-0.38, 0.86, 0.16]} rotation={[Math.PI / 2, 0, 0.45]}>
            <cylinderGeometry args={[0.007, 0.007, 0.14, 8]} />
            <meshStandardMaterial color="#6366f1" metalness={0.4} roughness={0.4} />
          </mesh>

          {[0, 1, 2].map((i) => (
            <RoundedBox
              key={i}
              args={[0.3, 0.048, 0.22]}
              radius={0.014}
              position={[-0.56, 0.86 + i * 0.05, -0.14]}
              rotation={[0, i * 0.12 - 0.1, 0]}
              castShadow
            >
              <meshStandardMaterial color={BOOK_COLORS[i]} roughness={0.78} />
            </RoundedBox>
          ))}

          <mesh position={[0.45, 0.88, 0.16]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.09, 16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
          </mesh>
        </>
      )}

      {/* Desk Lamp */}
      <mesh position={[0.62, 0.85, -0.18]}>
        <cylinderGeometry args={[0.07, 0.09, 0.035, 20]} />
        <meshStandardMaterial color="#34394e" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0.6, 1.0, -0.18]} rotation={[0, 0, 0.18]}>
        <cylinderGeometry args={[0.016, 0.016, 0.28, 12]} />
        <meshStandardMaterial color="#67708b" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0.56, 1.15, -0.16]} rotation={[0, 0, 0.24]}>
        <coneGeometry args={[0.12, 0.14, 20]} />
        <meshStandardMaterial
          color={isLive ? '#f3d6a4' : '#475569'}
          emissive={isLive ? '#ffbd74' : '#000000'}
          emissiveIntensity={isLive ? 0.65 : 0}
        />
      </mesh>
      {isLive && (
        <pointLight
          position={[0.52, 1.08, -0.1]}
          color="#ffc98b"
          intensity={1.5}
          distance={3.2}
          decay={1.8}
        />
      )}

      {/* Selection Floor Ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0.14]}>
          <ringGeometry args={[0.98, 1.1, 36]} />
          <meshBasicMaterial color="#818cf8" side={2} />
        </mesh>
      )}
    </group>
  );
}

function StudyChair({
  position,
  rotationY,
  chairStyle,
}: {
  position: [number, number, number];
  rotationY: number;
  chairStyle: ChairStyle;
}) {
  const cfg = CHAIR_MATERIALS[chairStyle] || CHAIR_MATERIALS.modern;
  const isGaming = chairStyle === 'gaming';

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Cushioned Seat */}
      <RoundedBox args={[0.64, 0.1, 0.58]} radius={0.05} position={[0, 0.45, 0.56]} castShadow receiveShadow>
        <meshStandardMaterial color={cfg.seat} roughness={0.72} />
      </RoundedBox>

      {/* Backrest (taller winged backrest for Gaming Chair) */}
      <RoundedBox
        args={[isGaming ? 0.66 : 0.62, isGaming ? 0.78 : 0.64, 0.1]}
        radius={0.05}
        position={[0, isGaming ? 0.88 : 0.82, 0.82]}
        castShadow
      >
        <meshStandardMaterial color={cfg.seat} roughness={0.72} />
      </RoundedBox>

      {/* Gaming Chair Racing Stripe */}
      {isGaming && (
        <RoundedBox args={[0.14, 0.68, 0.03]} radius={0.01} position={[0, 0.88, 0.775]}>
          <meshStandardMaterial color={cfg.accent} emissive={cfg.accent} emissiveIntensity={0.25} />
        </RoundedBox>
      )}

      {/* Armrests */}
      {[-0.31, 0.31].map((ax, i) => (
        <RoundedBox key={i} args={[0.06, 0.05, 0.36]} radius={0.02} position={[ax, 0.61, 0.58]} castShadow>
          <meshStandardMaterial color={cfg.accent} roughness={0.6} />
        </RoundedBox>
      ))}

      {/* Chair Stem & Base */}
      <mesh position={[0, 0.22, 0.56]}>
        <cylinderGeometry args={[0.045, 0.045, 0.42, 14]} />
        <meshStandardMaterial color="#8b91a3" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.04, 0.56]}>
        <cylinderGeometry args={[0.26, 0.28, 0.06, 20]} />
        <meshStandardMaterial color={cfg.base} metalness={0.65} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Plant({ position, isSakura }: { position: [number, number, number]; isSakura: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.42, 20]} />
        <meshStandardMaterial color={isSakura ? '#f9a8d4' : '#a16f63'} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.03, 18]} />
        <meshStandardMaterial color="#3b2b24" roughness={0.95} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const angle = (i / 7) * Math.PI * 2;
        const leafColor = isSakura
          ? i % 2 === 0
            ? '#f472b6'
            : '#fbcfe8'
          : i % 2 === 0
          ? '#70a77f'
          : '#5b926a';
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 0.16, 0.62 + (i % 3) * 0.09, Math.sin(angle) * 0.16]}
            rotation={[0.32, angle, 0.52]}
            scale={[0.12, 0.32, 0.055]}
            castShadow
          >
            <sphereGeometry args={[1, 10, 12]} />
            <meshStandardMaterial color={leafColor} roughness={0.78} />
          </mesh>
        );
      })}
    </group>
  );
}

function WallClock({ position }: { position: [number, number, number] }) {
  const minuteHandRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (minuteHandRef.current) {
      minuteHandRef.current.rotation.z = -clock.getElapsedTime() * 0.08;
    }
  });

  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.06, 28]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <circleGeometry args={[0.33, 28]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </mesh>
      <mesh position={[0.06, 0.04, 0.04]} rotation={[0, 0, -0.7]}>
        <boxGeometry args={[0.16, 0.024, 0.01]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh ref={minuteHandRef} position={[0, 0.08, 0.045]}>
        <boxGeometry args={[0.02, 0.22, 0.01]} />
        <meshStandardMaterial color="#6366f1" />
      </mesh>
    </group>
  );
}

function Bookshelf({ position, frameColor }: { position: [number, number, number]; frameColor: string }) {
  return (
    <group position={position}>
      <RoundedBox args={[2.1, 2.35, 0.38]} radius={0.04} position={[0, 1.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={frameColor} roughness={0.8} />
      </RoundedBox>
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4, 5].map((b) => (
          <RoundedBox
            key={`${row}-${b}`}
            args={[0.21, 0.36 + ((b + row) % 3) * 0.05, 0.24]}
            radius={0.015}
            position={[-0.75 + b * 0.3, 0.55 + row * 0.65, 0.08]}
            castShadow
          >
            <meshStandardMaterial color={BOOK_COLORS[(b + row * 2) % BOOK_COLORS.length]} roughness={0.72} />
          </RoundedBox>
        ))
      )}
    </group>
  );
}

interface StudyRoomEnvironmentProps {
  entries: RankedLeaderboardEntry[];
  selectedUid: string | null;
  onSelectMember: (uid: string) => void;
  customization?: RoomCustomization;
}

export default function StudyRoomEnvironment({
  entries,
  selectedUid,
  onSelectMember,
  customization = defaultRoomCustomization,
}: StudyRoomEnvironmentProps) {
  const palette = ROOM_THEME_PALETTES[customization.theme] || ROOM_THEME_PALETTES.cozy;
  const isNightWindow = customization.lighting === 'night' || customization.theme === 'midnight' || customization.theme === 'neon';
  const isSunsetWindow = customization.lighting === 'sunset';
  const visibleEntries = useMemo(() => entries.slice(0, DESK_SLOTS.length), [entries]);

  const windowSkyColor = isNightWindow ? '#1e3a8a' : isSunsetWindow ? '#ea580c' : '#60a5fa';
  const windowOrbColor = isNightWindow ? '#fef08a' : '#fde047';
  const shelfColor =
    customization.theme === 'minimal'
      ? '#cbd5e1'
      : customization.theme === 'neon'
      ? '#1e1b4b'
      : '#423330';

  return (
    <group>
      {/* Room Floor & Beveled Plinth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12.4, 8.8]} />
        <meshStandardMaterial color={palette.floorColor} roughness={0.82} />
      </mesh>
      <RoundedBox args={[12.6, 0.22, 9.0]} radius={0.08} position={[0, -0.12, 0]} receiveShadow>
        <meshStandardMaterial color={palette.plinthColor} roughness={0.85} />
      </RoundedBox>

      {/* Cozy Woven Rug */}
      <RoundedBox args={[9.6, 0.03, 5.5]} radius={0.015} position={[0, 0.015, 0.1]} receiveShadow>
        <meshStandardMaterial color={palette.rugColor} roughness={0.95} />
      </RoundedBox>

      {/* Back & Left Cutaway Walls */}
      <RoundedBox args={[12.4, 4.4, 0.2]} radius={0.04} position={[0, 2.2, -4.3]} receiveShadow>
        <meshStandardMaterial color={palette.backWallColor} roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.2, 4.4, 8.8]} radius={0.04} position={[-6.1, 2.2, 0]} receiveShadow>
        <meshStandardMaterial color={palette.sideWallColor} roughness={0.9} />
      </RoundedBox>

      {/* Theme Accent Cove Strip */}
      <mesh position={[0, 3.85, -4.18]}>
        <boxGeometry args={[11.2, 0.06, 0.04]} />
        <meshStandardMaterial
          color={palette.accentStripColor}
          emissive={palette.accentStripColor}
          emissiveIntensity={customization.theme === 'neon' ? 1.15 : 0.6}
        />
      </mesh>

      {/* Large Realistic Window with Curtains */}
      <group position={[0, 2.35, -4.16]}>
        <RoundedBox args={[3.5, 2.0, 0.12]} radius={0.04}>
          <meshStandardMaterial color="#334155" roughness={0.55} />
        </RoundedBox>
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[3.2, 1.72]} />
          <meshBasicMaterial color={windowSkyColor} />
        </mesh>
        <mesh position={[0.85, 0.35, 0.06]}>
          <circleGeometry args={[0.24, 24]} />
          <meshBasicMaterial color={windowOrbColor} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <boxGeometry args={[0.06, 1.74, 0.04]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <boxGeometry args={[3.24, 0.06, 0.04]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        {[-1.55, 1.55].map((cx, i) => (
          <RoundedBox key={i} args={[0.36, 2.1, 0.14]} radius={0.06} position={[cx, 0, 0.08]}>
            <meshStandardMaterial color={palette.curtainColor} roughness={0.85} />
          </RoundedBox>
        ))}
      </group>

      {/* Wall Decorations, Clock, Bookshelves & Corner Pouf */}
      {customization.showDecorations && (
        <>
          <WallClock position={[-2.15, 2.95, -4.18]} />
          <RoundedBox args={[1.05, 1.35, 0.06]} radius={0.02} position={[-5.97, 2.2, -1.6]} rotation={[0, Math.PI / 2, 0]}>
            <meshStandardMaterial color="#1e293b" roughness={0.5} />
          </RoundedBox>
          <mesh position={[-5.93, 2.2, -1.6]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.88, 1.18]} />
            <meshStandardMaterial
              color={palette.posterColor}
              emissive={palette.posterColor}
              emissiveIntensity={0.25}
            />
          </mesh>

          <Bookshelf position={[-4.0, 0, -3.98]} frameColor={shelfColor} />
          <Bookshelf position={[3.9, 0, -3.98]} frameColor={shelfColor} />

          <mesh position={[-5.15, 0.22, 0.8]} castShadow receiveShadow>
            <cylinderGeometry args={[0.45, 0.5, 0.38, 20]} />
            <meshStandardMaterial color={palette.poufColor} roughness={0.85} />
          </mesh>
        </>
      )}

      {/* 4 Corner Indoor Plants */}
      {customization.showPlants && (
        <>
          <Plant position={[-5.45, 0, -3.6]} isSakura={customization.theme === 'sakura'} />
          <Plant position={[5.45, 0, -3.6]} isSakura={customization.theme === 'sakura'} />
          <Plant position={[-5.45, 0, 3.6]} isSakura={customization.theme === 'sakura'} />
          <Plant position={[5.45, 0, 3.6]} isSakura={customization.theme === 'sakura'} />
        </>
      )}

      {/* 8 Interactive Study Desks & Chairs */}
      {DESK_SLOTS.map((slot, idx) => {
        const entry = visibleEntries[idx] || null;
        const isLive = Boolean(entry?.isStudyingLive);
        const isSelected = Boolean(entry && selectedUid === entry.uid);

        return (
          <group key={`station-${idx}`}>
            <DeskStation
              position={[slot.x, 0, slot.z]}
              rotationY={slot.rotY}
              isLive={isLive}
              isSelected={isSelected}
              deskStyle={customization.deskStyle}
              showDecorations={customization.showDecorations}
              onSelect={entry ? () => onSelectMember(entry.uid) : undefined}
            />
            <StudyChair
              position={[slot.x, 0, slot.z]}
              rotationY={slot.rotY}
              chairStyle={customization.chairStyle}
            />
          </group>
        );
      })}
    </group>
  );
}
