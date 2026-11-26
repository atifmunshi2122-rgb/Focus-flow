import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type {
  DreamGlobeDestination,
  MomentumWeatherOrbState,
  PaperAirplaneMessage,
  VinylRecordSleeve,
} from '../../features/home/homeDreamAndArcade.ts';

/* ------------------------------------------------------------------ *
 * 1. 3D Retro Arcade Cabinet (Goal Reward Machine)
 * ------------------------------------------------------------------ */
export const RetroArcadeCabinetProp: React.FC<{
  isUnlocked: boolean;
  dailyTargetPct: number;
  onClickArcade?: () => void;
}> = ({ isUnlocked, dailyTargetPct, onClickArcade }) => {
  const [hovered, setHovered] = useState(false);

  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
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

    ctx.fillStyle = isUnlocked ? '#090d24' : '#0f172a';
    ctx.fillRect(0, 0, w, h);

    if (isUnlocked) {
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 17px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GOAL UNLOCKED!', w / 2, 42);

      // Mini retro snake pixels
      ctx.fillStyle = '#34d399';
      [
        [44, 72],
        [58, 72],
        [72, 72],
        [86, 72],
        [86, 86],
      ].forEach(([px, py]) => ctx.fillRect(px, py, 12, 12));
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(130, 86, 12, 12);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('CLICK TO PLAY 2m', w / 2, 134);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ARCADE STANDBY', w / 2, 56);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`Goal: ${dailyTargetPct}%`, w / 2, 90);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('(Click for Break Play)', w / 2, 124);
    }
    texture.needsUpdate = true;
  }, [canvas, texture, isUnlocked, dailyTargetPct]);

  return (
    <group
      position={[2.22, 0, 1.72]}
      rotation={[0, -0.58, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClickArcade?.();
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
      {/* Lower Cabinet Body */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.48, 0.84, 0.44]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.45} />
      </mesh>
      {/* Control Deck with Joystick & Arcade Buttons */}
      <mesh position={[0, 0.84, 0.08]} rotation={[0.18, 0, 0]} castShadow>
        <boxGeometry args={[0.48, 0.06, 0.34]} />
        <meshStandardMaterial color="#312e81" roughness={0.4} />
      </mesh>
      <mesh position={[-0.1, 0.9, 0.14]}>
        <cylinderGeometry args={[0.008, 0.008, 0.07, 8]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} />
      </mesh>
      <mesh position={[-0.1, 0.94, 0.14]}>
        <sphereGeometry args={[0.02, 10, 10]} />
        <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.6} />
      </mesh>
      {[0.06, 0.12].map((bx, idx) => (
        <mesh key={idx} position={[bx, 0.88, 0.15]}>
          <cylinderGeometry args={[0.016, 0.016, 0.016, 10]} />
          <meshStandardMaterial
            color={idx === 0 ? '#38bdf8' : '#facc15'}
            emissive={idx === 0 ? '#0284c7' : '#eab308'}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
      {/* Upper Screen Hood */}
      <mesh position={[0, 1.12, -0.04]} castShadow>
        <boxGeometry args={[0.48, 0.56, 0.34]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.45} />
      </mesh>
      {/* Glowing Top Marquee */}
      <mesh position={[0, 1.35, 0.135]}>
        <boxGeometry args={[0.42, 0.09, 0.02]} />
        <meshStandardMaterial
          color="#a855f7"
          emissive={isUnlocked ? '#c084fc' : '#4c1d95'}
          emissiveIntensity={isUnlocked ? 1.7 : 0.4}
        />
      </mesh>
      {/* CRT Screen */}
      {texture && (
        <mesh position={[0, 1.09, 0.132]} rotation={[-0.1, 0, 0]}>
          <planeGeometry args={[0.38, 0.3]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={isUnlocked ? 1.15 : 0.45}
          />
        </mesh>
      )}
      {isUnlocked && <pointLight position={[0, 1.1, 0.35]} color="#38bdf8" intensity={0.8} distance={2.5} />}
      {hovered && (
        <Html position={[0, 1.56, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-purple-400/45 text-[10px] font-medium text-purple-100 whitespace-nowrap shadow-lg">
            🕹️ Retro Arcade · Click to play 2-min Break Game!
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 2. 3D Paper Airplane Message Delivery (Window -> Study Desk)
 * ------------------------------------------------------------------ */
export const PaperAirplaneDeliveryProp: React.FC<{
  unreadCount: number;
  latestMessage: PaperAirplaneMessage | null;
  deskOffsetY: number;
  onClickPlane?: () => void;
}> = ({ unreadCount, latestMessage, deskOffsetY, onClickPlane }) => {
  const [hovered, setHovered] = useState(false);
  const planeRef = useRef<THREE.Group | null>(null);
  const flightT = useRef(0);
  const prevUnread = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      flightT.current = 0; // re-fly from window when new note arrives!
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  useFrame(({ clock }, delta) => {
    if (!planeRef.current) return;
    const dt = Math.min(0.05, delta);
    if (flightT.current < 1) {
      flightT.current = Math.min(1, flightT.current + dt * 0.55);
    }
    const u = flightT.current;
    // Smooth parabolic glide from Left Window (-4.85, 2.05, -0.35) -> Study Desk (-4.18, 0.81+deskOffsetY, 0.92)
    const startX = -4.85;
    const startY = 2.05;
    const startZ = -0.35;
    const endX = -4.18;
    const endY = 0.82 + deskOffsetY;
    const endZ = 0.92;

    const x = THREE.MathUtils.lerp(startX, endX, u);
    const z = THREE.MathUtils.lerp(startZ, endZ, u);
    const arcLift = Math.sin(u * Math.PI) * 0.65;
    const idleBob = u >= 1 ? Math.sin(clock.elapsedTime * 2.6) * 0.015 : 0;
    const y = THREE.MathUtils.lerp(startY, endY, u) + arcLift + idleBob;

    planeRef.current.position.set(x, y, z);
    planeRef.current.rotation.set(0, u < 1 ? 0.45 : 0.72, u < 1 ? -0.18 : 0.03);
  });

  if (unreadCount <= 0 && !latestMessage) return null;

  return (
    <group
      ref={planeRef}
      position={[-4.18, 0.82 + deskOffsetY, 0.92]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClickPlane?.();
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
      {/* Crisp Folded Paper Wings */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <coneGeometry args={[0.075, 0.22, 3]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive={unreadCount > 0 ? '#38bdf8' : '#000000'}
          emissiveIntensity={unreadCount > 0 ? 0.35 : 0}
          roughness={0.6}
        />
      </mesh>
      {unreadCount > 0 && (
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshStandardMaterial color="#f43f5e" emissive="#fb7185" emissiveIntensity={1.6} />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, 0.22, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            ✈️ {unreadCount > 0 ? `${unreadCount} New Note from Squad/Partner` : 'Paper Plane Inbox'}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 3. Spinning 3D Dream Globe (Savings & Life Milestones)
 * ------------------------------------------------------------------ */
export const DreamGlobeProp: React.FC<{
  destination: DreamGlobeDestination;
  progress: number;
  onClickGlobe?: () => void;
}> = ({ destination, progress, onClickGlobe }) => {
  const [hovered, setHovered] = useState(false);
  const globeSpinRef = useRef<THREE.Group | null>(null);

  useFrame((_, delta) => {
    if (globeSpinRef.current) {
      globeSpinRef.current.rotation.y += Math.min(0.05, delta) * 0.45;
    }
  });

  // Mini airplane arc angle from home origin (0.2) toward destination pin (2.4)
  const planeAngle = 0.2 + progress * 2.1;

  return (
    <group
      position={[-0.44, 2.04, -3.12]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClickGlobe?.();
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
      {/* Brass Stand Base */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.04, 16]} />
        <meshStandardMaterial color="#b45309" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.25]}>
        <torusGeometry args={[0.165, 0.01, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.22} />
      </mesh>

      {/* Rotating Earth + Pin + Mini Flight Arc */}
      <group ref={globeSpinRef} position={[0, 0.2, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.145, 20, 20]} />
          <meshStandardMaterial color="#0284c7" roughness={0.35} />
        </mesh>
        {/* Stylized Continent Patches */}
        <mesh position={[0.09, 0.06, 0.08]} scale={[0.7, 0.5, 0.5]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#22c55e" roughness={0.7} />
        </mesh>
        <mesh position={[-0.1, -0.02, 0.07]} scale={[0.6, 0.8, 0.5]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#16a34a" roughness={0.7} />
        </mesh>
        {/* Glowing Destination Pin */}
        <mesh position={[0.02, 0.14, 0.06]}>
          <sphereGeometry args={[0.02, 10, 10]} />
          <meshStandardMaterial color="#f43f5e" emissive="#fb7185" emissiveIntensity={1.8} />
        </mesh>
        {/* Flight Arc Ring + Advancing Mini Plane */}
        <mesh rotation={[0.4, 0.2, 0]}>
          <torusGeometry args={[0.168, 0.004, 6, 28, Math.PI * 0.75]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
        <mesh
          position={[Math.cos(planeAngle) * 0.17, Math.sin(planeAngle) * 0.12, 0.07]}
          rotation={[0, 0, planeAngle]}
        >
          <coneGeometry args={[0.018, 0.045, 4]} />
          <meshStandardMaterial color="#ffffff" emissive="#fde047" emissiveIntensity={1.4} />
        </mesh>
      </group>

      {hovered && (
        <Html position={[0, 0.48, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            🌍 Dream Globe: {destination.city} ({Math.round(progress * 100)}% saved)
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 4. Unlockable 3D Wall Vinyl Record Rack
 * ------------------------------------------------------------------ */
export const VinylRecordRackProp: React.FC<{
  sleeves: VinylRecordSleeve[];
  activePreset: string;
  isVisiting: boolean;
  onSelectSleeve?: (sleeve: VinylRecordSleeve) => void;
}> = ({ sleeves, activePreset, isVisiting, onSelectSleeve }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <group position={[-4.95, 1.15, 2.78]}>
      {/* Slim Walnut Wall Ledge */}
      <mesh position={[0.02, -0.11, 0]} castShadow>
        <boxGeometry args={[0.06, 0.025, 0.88]} />
        <meshStandardMaterial color="#78350f" roughness={0.55} />
      </mesh>
      {sleeves.slice(0, 4).map((sl, idx) => {
        const z = -0.3 + idx * 0.2;
        const isActive = sl.unlocked && activePreset === sl.ambientPreset;
        return (
          <group
            key={sl.id}
            position={[0.02, 0.02, z]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              if (!isVisiting) onSelectSleeve?.(sl);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredId(sl.id);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredId((c) => (c === sl.id ? null : c));
              document.body.style.cursor = 'auto';
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[0.015, 0.21, 0.17]} />
              <meshStandardMaterial
                color={sl.unlocked ? sl.color : '#1e293b'}
                emissive={isActive ? sl.accentColor : '#000000'}
                emissiveIntensity={isActive ? 0.55 : 0}
                roughness={0.5}
              />
            </mesh>
            {/* Center LP Label Disc Graphic */}
            <mesh position={[0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <circleGeometry args={[0.045, 14]} />
              <meshBasicMaterial color={sl.unlocked ? sl.accentColor : '#475569'} />
            </mesh>
            {hoveredId === sl.id && (
              <Html position={[0.1, 0.18, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-indigo-400/45 text-[10px] font-medium text-indigo-100 whitespace-nowrap shadow-lg">
                  {sl.unlocked
                    ? `💿 ${sl.title} · Click to play`
                    : `🔒 ${sl.title} (Unlock at ${sl.requiredSessions} sessions)`}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 5. Desk Momentum Weather Orb (Glass Sphere)
 * ------------------------------------------------------------------ */
export const MomentumWeatherOrbProp: React.FC<{ state: MomentumWeatherOrbState }> = ({ state }) => {
  const [hovered, setHovered] = useState(false);
  const innerRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    if (!innerRef.current) return;
    const t = clock.elapsedTime;
    innerRef.current.rotation.y = t * (state.mood === 'electric_storm' ? 2.6 : 0.7);
    innerRef.current.position.y = 0.08 + Math.sin(t * 2.2) * 0.008;
  });

  return (
    <group
      position={[-4.36, 0.782, 1.84]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
      }}
    >
      {/* Walnut Pedestal Ring */}
      <mesh position={[0, 0.012, 0]} castShadow>
        <cylinderGeometry args={[0.044, 0.052, 0.024, 14]} />
        <meshStandardMaterial color="#451a03" roughness={0.55} />
      </mesh>
      {/* Outer Crystal Sphere */}
      <mesh position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.062, 18, 18]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.28} roughness={0.06} metalness={0.1} />
      </mesh>
      {/* Inner Dynamic Core (Clouds / Sun / Electric Storm) */}
      <group ref={innerRef} position={[0, 0.08, 0]}>
        <mesh>
          <sphereGeometry args={[0.026, 12, 12]} />
          <meshStandardMaterial
            color={state.primaryColor}
            emissive={state.primaryColor}
            emissiveIntensity={state.coreIntensity}
          />
        </mesh>
        {state.mood === 'electric_storm' &&
          [0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.cos(i * 2.1) * 0.036, 0, Math.sin(i * 2.1) * 0.036]}>
              <octahedronGeometry args={[0.009, 0]} />
              <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={2.1} />
            </mesh>
          ))}
      </group>
      {hovered && (
        <Html position={[0, 0.22, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            🔮 {state.label}
          </div>
        </Html>
      )}
    </group>
  );
};

