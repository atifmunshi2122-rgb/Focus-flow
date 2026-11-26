import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type {
  HeatmapCell,
  MonthlyBudgetSummary,
  PlacedShopItem,
  ShopItemId,
  SunMoonSkyState,
} from '../../features/home/homeShopAndLayout.ts';

/* ------------------------------------------------------------------ *
 * 1. Individual Purchasable 3D Shop Items
 * ------------------------------------------------------------------ */
const FishAquariumMesh: React.FC = () => {
  const fishGroupRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    if (!fishGroupRef.current) return;
    const t = clock.elapsedTime;
    fishGroupRef.current.children.forEach((fish, idx) => {
      const speed = 0.9 + idx * 0.25;
      fish.position.x = Math.sin(t * speed + idx * 2.1) * 0.16;
      fish.position.z = Math.cos(t * speed * 0.7 + idx * 1.3) * 0.055;
      fish.position.y = 0.52 + Math.sin(t * 2.0 + idx) * 0.04;
      fish.rotation.y = Math.cos(t * speed + idx * 2.1) >= 0 ? 0 : Math.PI;
    });
  });

  return (
    <group>
      {/* Oak Cabinet Stand */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.36, 0.28]} />
        <meshStandardMaterial color="#78350f" roughness={0.55} />
      </mesh>
      {/* Glass Tank & Illuminated Cyan Water */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.52, 0.32, 0.24]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0284c7"
          emissiveIntensity={0.65}
          transparent
          opacity={0.42}
          roughness={0.12}
        />
      </mesh>
      {/* Sandy Gravel Bed */}
      <mesh position={[0, 0.375, 0]}>
        <boxGeometry args={[0.49, 0.03, 0.21]} />
        <meshStandardMaterial color="#e7d5b8" roughness={0.9} />
      </mesh>
      {/* Swimming Fish */}
      <group ref={fishGroupRef}>
        {['#fb923c', '#facc15', '#f472b6'].map((c, idx) => (
          <mesh key={idx} position={[0, 0.52, 0]}>
            <capsuleGeometry args={[0.016, 0.032, 4, 8]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.45} />
          </mesh>
        ))}
      </group>
      <pointLight position={[0, 0.6, 0.1]} color="#38bdf8" intensity={0.55} distance={2.2} />
    </group>
  );
};

const BeanBagMesh: React.FC = () => (
  <group>
    <mesh position={[0, 0.18, 0]} scale={[1.15, 0.72, 1.15]} castShadow receiveShadow>
      <sphereGeometry args={[0.32, 18, 14]} />
      <meshStandardMaterial color="#3730a3" roughness={0.88} />
    </mesh>
    <mesh position={[0, 0.32, -0.14]} scale={[0.9, 0.85, 0.75]} castShadow>
      <sphereGeometry args={[0.24, 16, 12]} />
      <meshStandardMaterial color="#4338ca" roughness={0.88} />
    </mesh>
  </group>
);

const TripodFloorLampMesh: React.FC = () => (
  <group>
    {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((ang, i) => (
      <mesh
        key={i}
        position={[Math.cos(ang) * 0.1, 0.55, Math.sin(ang) * 0.1]}
        rotation={[Math.sin(ang) * 0.15, 0, -Math.cos(ang) * 0.15]}
        castShadow
      >
        <cylinderGeometry args={[0.015, 0.018, 1.15, 8]} />
        <meshStandardMaterial color="#8e4d20" roughness={0.55} />
      </mesh>
    ))}
    <mesh position={[0, 1.24, 0]} castShadow>
      <cylinderGeometry args={[0.16, 0.22, 0.28, 18]} />
      <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={0.8} roughness={0.65} />
    </mesh>
    <pointLight position={[0, 1.22, 0]} color="#fde68a" intensity={1.1} distance={3.5} decay={2} />
  </group>
);

const BonsaiTreeMesh: React.FC = () => (
  <group>
    <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.18, 0.16, 0.28, 14]} />
      <meshStandardMaterial color="#1e293b" roughness={0.55} />
    </mesh>
    <mesh position={[0, 0.31, 0]} castShadow>
      <boxGeometry args={[0.28, 0.06, 0.2]} />
      <meshStandardMaterial color="#334155" roughness={0.45} />
    </mesh>
    <mesh position={[0, 0.44, 0]} rotation={[0.15, 0, -0.2]} castShadow>
      <cylinderGeometry args={[0.025, 0.04, 0.24, 8]} />
      <meshStandardMaterial color="#5c3a21" roughness={0.85} />
    </mesh>
    {[
      [-0.08, 0.56, 0.04, 0.12],
      [0.09, 0.52, -0.03, 0.1],
      [0.01, 0.62, 0.0, 0.11],
    ].map(([lx, ly, lz, r], idx) => (
      <mesh key={idx} position={[lx, ly, lz]} scale={[1.3, 0.65, 1.1]} castShadow>
        <sphereGeometry args={[r, 12, 10]} />
        <meshStandardMaterial color={idx === 1 ? '#15803d' : '#22c55e'} roughness={0.65} />
      </mesh>
    ))}
  </group>
);

const RgbLedStripMesh: React.FC = () => (
  <group>
    <mesh position={[0, 0.02, 0]} castShadow>
      <boxGeometry args={[0.85, 0.03, 0.06]} />
      <meshStandardMaterial color="#0f172a" roughness={0.4} />
    </mesh>
    <mesh position={[0, 0.04, 0]}>
      <boxGeometry args={[0.82, 0.015, 0.04]} />
      <meshStandardMaterial color="#38bdf8" emissive="#a855f7" emissiveIntensity={1.9} />
    </mesh>
  </group>
);

const WallPosterEaselMesh: React.FC = () => (
  <group>
    <mesh position={[0, 0.48, 0]} rotation={[-0.12, 0, 0]} castShadow>
      <boxGeometry args={[0.42, 0.58, 0.03]} />
      <meshStandardMaterial color="#8e4d20" roughness={0.5} />
    </mesh>
    <mesh position={[0, 0.48, 0.018]} rotation={[-0.12, 0, 0]}>
      <planeGeometry args={[0.35, 0.5]} />
      <meshStandardMaterial color="#1e1b4b" emissive="#4f46e5" emissiveIntensity={0.45} />
    </mesh>
    <mesh position={[0, 0.5, 0.022]} rotation={[-0.12, 0, 0]}>
      <ringGeometry args={[0.07, 0.11, 24]} />
      <meshBasicMaterial color="#fbbf24" />
    </mesh>
  </group>
);

export const PlacedShopFurnitureGroup: React.FC<{
  placedItems: PlacedShopItem[];
  layoutEditMode: boolean;
  selectedItemId: ShopItemId | null;
  onSelectPlacedItem: (id: ShopItemId) => void;
  onClickGridFloor?: (x: number, z: number) => void;
}> = ({ placedItems, layoutEditMode, selectedItemId, onSelectPlacedItem, onClickGridFloor }) => {
  return (
    <group>
      {/* Subtle 0.5m Grid Overlay in Layout Edit Mode */}
      {layoutEditMode && (
        <group position={[-0.65, 0.016, 0.7]}>
          <gridHelper args={[6.0, 12, '#38bdf8', '#1e3a8a']} />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onClickGridFloor?.(e.point.x, e.point.z);
            }}
          >
            <planeGeometry args={[6.0, 4.0]} />
            <meshBasicMaterial transparent opacity={0.0} />
          </mesh>
        </group>
      )}

      {placedItems.map((placed) => {
        const isSelected = layoutEditMode && selectedItemId === placed.itemId;
        return (
          <group
            key={placed.itemId}
            position={[placed.x, placed.y, placed.z]}
            rotation={[0, placed.rotationY, 0]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (!layoutEditMode) return;
              e.stopPropagation();
              onSelectPlacedItem(placed.itemId);
            }}
          >
            {placed.itemId === 'fish_aquarium' && <FishAquariumMesh />}
            {placed.itemId === 'bean_bag' && <BeanBagMesh />}
            {placed.itemId === 'floor_lamp' && <TripodFloorLampMesh />}
            {placed.itemId === 'bonsai_tree' && <BonsaiTreeMesh />}
            {placed.itemId === 'rgb_led_strip' && <RgbLedStripMesh />}
            {placed.itemId === 'wall_poster' && <WallPosterEaselMesh />}

            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.34, 0.42, 24]} />
                <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 2. Real-Time Window Sun / Moon Orb & Milestone Fireworks
 * ------------------------------------------------------------------ */
export const SunMoonSkyOrb: React.FC<{ sky: SunMoonSkyState }> = ({ sky }) => (
  <group position={[-5.45, sky.orbY, sky.orbZ]}>
    <mesh>
      <sphereGeometry args={[0.24, 16, 16]} />
      <meshStandardMaterial
        color={sky.orbColor}
        emissive={sky.orbColor}
        emissiveIntensity={sky.isNight ? 1.5 : 1.9}
      />
    </mesh>
    <pointLight
      position={[0.3, 0, 0]}
      color={sky.orbColor}
      intensity={sky.isNight ? 0.65 : 1.15}
      distance={7.5}
    />
  </group>
);

export const MilestoneFireworksProp: React.FC<{ active: boolean }> = ({ active }) => {
  const burstsRef = useRef<THREE.Group | null>(null);

  const bursts = useMemo(
    () => [
      { pos: [-5.8, 4.1, -4.4] as [number, number, number], color: '#fbbf24', phase: 0 },
      { pos: [-3.2, 4.5, -5.0] as [number, number, number], color: '#38bdf8', phase: 1.1 },
      { pos: [-6.4, 3.8, -2.6] as [number, number, number], color: '#f472b6', phase: 2.2 },
    ],
    []
  );

  useFrame(({ clock }) => {
    if (!active || !burstsRef.current) return;
    const t = clock.elapsedTime;
    burstsRef.current.children.forEach((group, idx) => {
      const b = bursts[idx];
      if (!b) return;
      const cycle = ((t * 0.55 + b.phase) % 1);
      const scale = 0.25 + cycle * 1.45;
      group.scale.set(scale, scale, scale);
      group.visible = cycle < 0.85;
    });
  });

  if (!active) return null;

  return (
    <group ref={burstsRef}>
      {bursts.map((b, idx) => (
        <group key={idx} position={b.pos}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((ray) => {
            const ang = (ray / 8) * Math.PI * 2;
            return (
              <mesh key={ray} position={[Math.cos(ang) * 0.42, Math.sin(ang) * 0.42, 0]}>
                <sphereGeometry args={[0.045, 8, 8]} />
                <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={2.2} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 3. Break-Time 1-Min 3D Breathing Orb
 * ------------------------------------------------------------------ */
export const BreathingOrbProp: React.FC<{
  active: boolean;
  secondsLeft: number;
  hasBalcony: boolean;
}> = ({ active, secondsLeft, hasBalcony }) => {
  const orbRef = useRef<THREE.Mesh | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const lastPhaseRef = useRef<'Inhale' | 'Hold' | 'Exhale'>('Inhale');

  useFrame(({ clock }) => {
    if (!active || !orbRef.current) return;
    const cycle = clock.elapsedTime % 10; // 4s Inhale, 2s Hold, 4s Exhale
    let scale = 1;
    let nextPhase: 'Inhale' | 'Hold' | 'Exhale' = 'Inhale';
    if (cycle < 4) {
      scale = 0.72 + (cycle / 4) * 0.68;
      nextPhase = 'Inhale';
    } else if (cycle < 6) {
      scale = 1.4;
      nextPhase = 'Hold';
    } else {
      scale = 1.4 - ((cycle - 6) / 4) * 0.68;
      nextPhase = 'Exhale';
    }
    orbRef.current.scale.set(scale, scale, scale);
    if (nextPhase !== lastPhaseRef.current) {
      lastPhaseRef.current = nextPhase;
      setPhaseLabel(nextPhase);
    }
  });

  if (!active) return null;

  const pos: [number, number, number] = hasBalcony ? [-6.15, 1.15, 2.2] : [0.75, 1.15, 2.15];

  return (
    <group position={pos}>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[0.26, 2]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#818cf8"
          emissiveIntensity={1.45}
          transparent
          opacity={0.78}
          roughness={0.18}
        />
      </mesh>
      <pointLight color="#38bdf8" intensity={1.3} distance={3.2} />
      <Html position={[0, 0.62, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="px-3 py-1 rounded-full bg-slate-950/90 border border-sky-400/50 text-xs font-semibold text-sky-100 whitespace-nowrap shadow-xl">
          🫧 {phaseLabel}... ({secondsLeft}s)
        </div>
      </Html>
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 4. Live Smart Wall TV Dashboard (Focus + Monthly Budget + Heatmap)
 * ------------------------------------------------------------------ */
export const SmartWallTvDashboard: React.FC<{
  todayFocusMinutes: number;
  dailyGoalMinutes: number;
  budgetSummary: MonthlyBudgetSummary;
  heatmap: HeatmapCell[];
  streakDays: number;
  isVisiting: boolean;
  onClickTV?: () => void;
}> = ({
  todayFocusMinutes,
  dailyGoalMinutes,
  budgetSummary,
  heatmap,
  streakDays,
  isVisiting,
  onClickTV,
}) => {
  const [hovered, setHovered] = useState(false);

  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 420;
    c.height = 260;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { texture: t, canvas: c };
  }, []);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useEffect(() => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#090f24';
    ctx.fillRect(0, 0, w, h);

    // Header bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, 36);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FOCUSFLOW SMART TV OS', 16, 23);

    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'right';
    ctx.fillText(`🔥 ${streakDays}d Streak`, w - 16, 23);

    // 1. Focus Bar
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`Today's Focus: ${todayFocusMinutes} / ${dailyGoalMinutes} min`, 18, 66);

    const focusPct = Math.min(1, todayFocusMinutes / Math.max(15, dailyGoalMinutes));
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(18, 76, w - 36, 12);
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(18, 76, Math.max(6, Math.round((w - 36) * focusPct)), 12);

    // 2. Monthly Budget Bar (Hidden in Visit Mode)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      isVisiting
        ? 'Monthly Budget: Private (Read-Only)'
        : `Monthly Budget: ₹${Math.round(budgetSummary.spentPaiseThisMonth / 100).toLocaleString('en-IN')} / ₹${Math.round(budgetSummary.budgetPaise / 100).toLocaleString('en-IN')} (${budgetSummary.budgetPct}%)`,
      18,
      118
    );
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(18, 128, w - 36, 12);
    if (!isVisiting) {
      ctx.fillStyle =
        budgetSummary.budgetPct >= 90
          ? '#f43f5e'
          : budgetSummary.budgetPct >= 70
            ? '#f59e0b'
            : '#10b981';
      ctx.fillRect(18, 128, Math.max(6, Math.round((w - 36) * (budgetSummary.budgetPct / 100))), 12);
    }

    // 3. 14-Day Streak Heatmap Grid
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('14-Day Activity Heatmap', 18, 172);
    const cellSize = 22;
    const gap = 6;
    const colors = ['#1e293b', '#065f46', '#10b981', '#34d399'];
    heatmap.slice(0, 14).forEach((cell, i) => {
      const col = i % 14;
      const x = 18 + col * (cellSize + gap);
      const y = 186;
      ctx.fillStyle = colors[cell.level];
      ctx.beginPath();
      ctx.roundRect(x, y, cellSize, cellSize, 5);
      ctx.fill();
    });

    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Click Smart TV to open Analytics Dashboard →', 18, h - 18);

    texture.needsUpdate = true;
  }, [canvas, texture, todayFocusMinutes, dailyGoalMinutes, budgetSummary, heatmap, streakDays, isVisiting]);

  return (
    <group
      position={[2.72, 1.92, -0.25]}
      rotation={[0, -Math.PI / 2, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClickTV?.();
      }}
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
      {/* Sleek Matte Black TV Bezel */}
      <mesh castShadow>
        <boxGeometry args={[1.45, 0.9, 0.04]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.4} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.023]}>
          <planeGeometry args={[1.36, 0.82]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={0.62}
            roughness={0.22}
          />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, 0.6, 0.05]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            📺 Smart Wall TV · Click for Analytics
          </div>
        </Html>
      )}
    </group>
  );
};

