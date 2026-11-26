import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type {
  ApartmentExpansionState,
  DoomscrollJarState,
  DoorstepDeliveriesState,
  HydrationHabitState,
  TimeCapsuleChestState,
  VaultSafeState,
} from '../../features/home/homeFeaturesEngine.ts';

/* ------------------------------------------------------------------ *
 * 1. 3D Vault Safe (Bronze -> Silver -> Gold by Savings Goal %)
 * ------------------------------------------------------------------ */
export const VaultSafeProp: React.FC<{
  state: VaultSafeState;
  onClick?: () => void;
}> = ({ state, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const finish = useMemo(() => {
    switch (state.tier) {
      case 'gold':
        return { body: '#d97706', door: '#fbbf24', trim: '#fef08a', metal: 0.9, rough: 0.22, glow: '#f59e0b' };
      case 'silver':
        return { body: '#94a3b8', door: '#e2e8f0', trim: '#f8fafc', metal: 0.86, rough: 0.24, glow: '#38bdf8' };
      case 'bronze':
        return { body: '#92400e', door: '#c26d27', trim: '#f59e0b', metal: 0.78, rough: 0.3, glow: '#fb923c' };
      default:
        return { body: '#334155', door: '#475569', trim: '#94a3b8', metal: 0.55, rough: 0.45, glow: '#64748b' };
    }
  }, [state.tier]);

  return (
    <group
      position={[-3.32, 0, 2.95]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Heavy metallic safe cabinet */}
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.48, 0.38]} />
        <meshStandardMaterial color={finish.body} metalness={finish.metal} roughness={finish.rough} />
      </mesh>
      {/* Front armored door panel */}
      <mesh position={[0, 0.25, 0.195]} castShadow>
        <boxGeometry args={[0.35, 0.41, 0.025]} />
        <meshStandardMaterial color={finish.door} metalness={finish.metal} roughness={finish.rough * 0.9} />
      </mesh>
      {/* Combination Vault Wheel */}
      <mesh position={[0.04, 0.26, 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.03, 18]} />
        <meshStandardMaterial color={finish.trim} metalness={0.88} roughness={0.22} />
      </mesh>
      {/* Progress LED Indicator Bar */}
      <mesh position={[-0.08, 0.38, 0.215]}>
        <boxGeometry args={[0.12, 0.028, 0.012]} />
        <meshStandardMaterial
          color={finish.glow}
          emissive={finish.glow}
          emissiveIntensity={state.tier === 'starter' ? 0.4 : 1.4}
        />
      </mesh>
      {hovered && (
        <Html position={[0, 0.65, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-amber-400/45 text-[10px] font-medium text-amber-100 whitespace-nowrap shadow-lg">
            🏦 {state.label} ({state.bestSavingsPct}%) · Click
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 2. Doorstep Parcel Box (Shopping/Gadgets) & Red-Ribbon Bill Mail
 * ------------------------------------------------------------------ */
export const DoorstepParcelAndMailProp: React.FC<{
  state: DoorstepDeliveriesState;
  onClick?: () => void;
}> = ({ state, onClick }) => {
  const [hovered, setHovered] = useState(false);

  if (!state.hasParcel && !state.hasMail) return null;

  return (
    <group
      position={[1.38, 0, 2.92]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Kraft Cardboard Shopping Parcel Box */}
      {state.hasParcel && (
        <group position={[0, 0, 0]} rotation={[0, 0.22, 0]}>
          <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.24, 0.28]} />
            <meshStandardMaterial color="#c69358" roughness={0.82} />
          </mesh>
          {/* Packing tape strip */}
          <mesh position={[0, 0.242, 0]}>
            <boxGeometry args={[0.345, 0.006, 0.06]} />
            <meshStandardMaterial color="#fde68a" roughness={0.6} />
          </mesh>
          {/* Shipping sticker */}
          <mesh position={[0.08, 0.243, 0.07]}>
            <boxGeometry args={[0.1, 0.005, 0.07]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Ivory Bill Envelope with Red Ribbon & Seal */}
      {state.hasMail && (
        <group position={[state.hasParcel ? 0.34 : 0.08, 0.015, 0.06]} rotation={[0, -0.28, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.24, 0.018, 0.16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.7} />
          </mesh>
          {/* Red Ribbon Band */}
          <mesh position={[0, 0.011, 0]}>
            <boxGeometry args={[0.244, 0.005, 0.032]} />
            <meshStandardMaterial color="#e11d48" emissive="#be123c" emissiveIntensity={0.35} roughness={0.4} />
          </mesh>
          {/* Wax Seal */}
          <mesh position={[0, 0.016, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.008, 12]} />
            <meshStandardMaterial color="#be123c" roughness={0.35} />
          </mesh>
        </group>
      )}

      {hovered && (
        <Html position={[0.14, 0.45, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-rose-400/45 text-[10px] font-medium text-rose-100 whitespace-nowrap shadow-lg">
            📦 {state.parcelCount} Parcels · ✉️ {state.mailCount} Bills · Click details
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 3. Wall Mini-Whiteboard Synced to Latest Saved Whiteboard Sketch
 * ------------------------------------------------------------------ */
export const WallMiniWhiteboardProp: React.FC<{
  dataUrl: string | null;
  sketchTitle?: string;
  isVisiting: boolean;
  onClick?: () => void;
}> = ({ dataUrl, sketchTitle, isVisiting, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 220;
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

    const drawFallbackBoard = () => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      ctx.lineWidth = 1;
      for (let x = 20; x < w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 20; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MINI WHITEBOARD', w / 2, h / 2 - 8);
      ctx.fillStyle = '#6366f1';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('Click to Open Rough Sketch Pad', w / 2, h / 2 + 18);
      texture.needsUpdate = true;
    };

    if (!dataUrl || typeof Image === 'undefined') {
      drawFallbackBoard();
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      texture.needsUpdate = true;
    };
    img.onerror = () => {
      if (!cancelled) drawFallbackBoard();
    };
    img.src = dataUrl;

    return () => {
      cancelled = true;
    };
  }, [canvas, texture, dataUrl]);

  return (
    <group
      position={[-4.95, 1.82, 2.78]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Brushed Aluminum Bevel Frame */}
      <mesh castShadow>
        <boxGeometry args={[0.04, 0.58, 0.84]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.55} roughness={0.3} />
      </mesh>
      {texture && (
        <mesh position={[0.023, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.78, 0.52]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={0.22}
            roughness={0.25}
          />
        </mesh>
      )}
      {/* Bottom Marker Ledge + Markers */}
      <mesh position={[0.04, -0.29, 0]} castShadow>
        <boxGeometry args={[0.06, 0.02, 0.54]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0.045, -0.275, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.11, 8]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      <mesh position={[0.045, -0.275, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.11, 8]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {hovered && (
        <Html position={[0.1, 0.42, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-indigo-400/45 text-[10px] font-medium text-indigo-100 whitespace-nowrap shadow-lg">
            {isVisiting
              ? `Whiteboard${sketchTitle ? `: ${sketchTitle}` : ''}`
              : '✏️ Wall Whiteboard · Click to draw'}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 4. "Flow State" Golden Fireflies & Warm Dust Motes (25+ min zero pause)
 * ------------------------------------------------------------------ */
export const FlowStateGoldenAuraProp: React.FC<{ active: boolean }> = ({ active }) => {
  const groupRef = useRef<THREE.Group | null>(null);

  const motes = useMemo(() => {
    const out: Array<{ baseX: number; baseY: number; baseZ: number; speed: number; phase: number; size: number }> = [];
    for (let i = 0; i < 36; i += 1) {
      const s1 = ((i * 61) % 100) / 100;
      const s2 = ((i * 43) % 100) / 100;
      const s3 = ((i * 79) % 100) / 100;
      out.push({
        baseX: -4.4 + s1 * 7.8,
        baseY: 0.45 + s2 * 2.1,
        baseZ: -2.8 + s3 * 5.2,
        speed: 0.65 + (i % 5) * 0.22,
        phase: i * 0.7,
        size: 0.02 + (i % 3) * 0.009,
      });
    }
    return out;
  }, []);

  useFrame(({ clock }) => {
    if (!active || !groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.children.forEach((mesh, i) => {
      const m = motes[i];
      if (!m) return;
      mesh.position.x = m.baseX + Math.sin(t * m.speed + m.phase) * 0.35;
      mesh.position.y = m.baseY + Math.cos(t * m.speed * 0.8 + m.phase) * 0.24;
      mesh.position.z = m.baseZ + Math.sin(t * m.speed * 0.6 - m.phase) * 0.3;
      const s = 0.75 + Math.sin(t * 2.4 + m.phase) * 0.35;
      mesh.scale.set(s, s, s);
    });
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      {motes.map((m, i) => (
        <mesh key={i} position={[m.baseX, m.baseY, m.baseZ]}>
          <sphereGeometry args={[m.size, 8, 8]} />
          <meshStandardMaterial
            color="#fef08a"
            emissive="#fbbf24"
            emissiveIntensity={2.1}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 5. 3D Doomscroll Tax Glass Coin Jar on Front Console
 * ------------------------------------------------------------------ */
export const DoomscrollTaxJarProp: React.FC<{
  state: DoomscrollJarState;
  onClick?: () => void;
}> = ({ state, onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={[-2.74, 0.61, 2.95]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Clear Glass Jar Body */}
      <mesh position={[0, 0.115, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.22, 18]} />
        <meshStandardMaterial
          color="#bae6fd"
          transparent
          opacity={0.34}
          roughness={0.08}
          metalness={0.15}
        />
      </mesh>
      {/* Brass Lid */}
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.078, 0.078, 0.025, 18]} />
        <meshStandardMaterial color="#d97706" metalness={0.7} roughness={0.28} />
      </mesh>
      {/* Coin Stack Inside */}
      {Array.from({ length: state.coinCount }).map((_, idx) => {
        const layer = Math.floor(idx / 3);
        const col = idx % 3;
        const angle = col * 2.1 + layer * 0.7;
        return (
          <mesh
            key={idx}
            position={[Math.cos(angle) * 0.028, 0.02 + layer * 0.014, Math.sin(angle) * 0.028]}
            castShadow
          >
            <cylinderGeometry args={[0.022, 0.022, 0.008, 12]} />
            <meshStandardMaterial
              color="#fbbf24"
              emissive="#f59e0b"
              emissiveIntensity={0.3}
              metalness={0.85}
              roughness={0.22}
            />
          </mesh>
        );
      })}
      {/* Empty Jar Emerald Sparkle Indicator when clean */}
      {state.isEmpty && (
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.015, 14]} />
          <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={1.1} />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, 0.38, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-amber-400/45 text-[10px] font-medium text-amber-100 whitespace-nowrap shadow-lg">
            🪙 Doomscroll Jar: ₹{state.totalTaxAmount} ({state.totalMinutes}m)
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 6. Glowing Time Capsule Chest
 * ------------------------------------------------------------------ */
export const TimeCapsuleChestProp: React.FC<{
  state: TimeCapsuleChestState;
  onClick?: () => void;
}> = ({ state, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const glowLightRef = useRef<THREE.PointLight | null>(null);
  const badgeOrbRef = useRef<THREE.Mesh | null>(null);

  useFrame(({ clock }) => {
    if (!state.shouldGlow) return;
    const t = clock.elapsedTime;
    const pulse = 1.2 + Math.sin(t * 3.5) * 0.55;
    if (glowLightRef.current) glowLightRef.current.intensity = pulse;
    if (badgeOrbRef.current) {
      badgeOrbRef.current.position.y = 0.44 + Math.sin(t * 3) * 0.04;
    }
  });

  return (
    <group
      position={[-3.38, 0, -2.92]}
      rotation={[0, 0.3, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Chest Base */}
      <mesh position={[0, 0.13, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.24, 0.28]} />
        <meshStandardMaterial color="#78350f" roughness={0.55} />
      </mesh>
      {/* Rounded Brass Lid */}
      <mesh position={[0, 0.25, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.42, 14, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#92400e" roughness={0.5} />
      </mesh>
      {/* Gold Clasp Lock */}
      <mesh position={[0, 0.22, 0.146]}>
        <boxGeometry args={[0.07, 0.08, 0.02]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive={state.shouldGlow ? '#f59e0b' : '#000000'}
          emissiveIntensity={state.shouldGlow ? 1.5 : 0}
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>
      {state.shouldGlow && (
        <>
          <mesh ref={badgeOrbRef} position={[0, 0.44, 0]}>
            <octahedronGeometry args={[0.055, 0]} />
            <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={2.0} />
          </mesh>
          <pointLight ref={glowLightRef} position={[0, 0.42, 0.12]} color="#34d399" intensity={1.4} distance={2.5} />
        </>
      )}
      {hovered && (
        <Html position={[0, 0.58, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-emerald-400/45 text-[10px] font-medium text-emerald-100 whitespace-nowrap shadow-lg">
            {state.shouldGlow
              ? `✨ ${state.readyCount} Time Capsule Ready to Open!`
              : `🔒 Time Capsules (${state.lockedCount} Sealed)`}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 7. 3D Vinyl Turntable / Lo-Fi Player on Front Console
 * ------------------------------------------------------------------ */
export const VinylTurntableProp: React.FC<{
  isPlaying: boolean;
  onClick?: () => void;
}> = ({ isPlaying, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const discRef = useRef<THREE.Group | null>(null);
  const armRef = useRef<THREE.Group | null>(null);
  const notesRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.elapsedTime;
    if (discRef.current && isPlaying) {
      discRef.current.rotation.y -= dt * 1.9;
    }
    if (armRef.current) {
      const targetAngle = isPlaying ? 0.34 : 0.0;
      armRef.current.rotation.y = THREE.MathUtils.lerp(armRef.current.rotation.y, targetAngle, 0.15);
    }
    if (notesRef.current && isPlaying) {
      notesRef.current.children.forEach((n, i) => {
        const phase = (t * 0.55 + i * 0.33) % 1;
        n.position.y = 0.08 + phase * 0.28;
        n.position.x = Math.sin(t * 2 + i) * 0.04;
      });
    }
  });

  return (
    <group
      position={[-2.36, 0.61, 2.95]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Walnut Plinth */}
      <mesh position={[0, 0.022, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.042, 0.25]} />
        <meshStandardMaterial color="#78350f" roughness={0.48} />
      </mesh>
      {/* Spinning Vinyl Platter */}
      <group ref={discRef} position={[-0.025, 0.048, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.095, 0.095, 0.01, 24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.006, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.004, 16]} />
          <meshStandardMaterial
            color="#e11d48"
            emissive={isPlaying ? '#f43f5e' : '#000000'}
            emissiveIntensity={isPlaying ? 0.6 : 0}
          />
        </mesh>
        {/* Spindle Marker Dot so spin is visibly crisp */}
        <mesh position={[0.06, 0.007, 0]}>
          <boxGeometry args={[0.022, 0.003, 0.006]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      </group>
      {/* Brushed Chrome Tonearm */}
      <group ref={armRef} position={[0.105, 0.056, -0.08]}>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[0.01, 0.008, 0.14]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.85} roughness={0.2} />
        </mesh>
      </group>
      {/* Glowing Power LED */}
      <mesh position={[0.11, 0.046, 0.09]}>
        <sphereGeometry args={[0.01, 8, 8]} />
        <meshStandardMaterial
          color={isPlaying ? '#38bdf8' : '#64748b'}
          emissive={isPlaying ? '#38bdf8' : '#000000'}
          emissiveIntensity={isPlaying ? 1.8 : 0}
        />
      </mesh>
      {/* Floating Glowing Note Orbs while playing */}
      {isPlaying && (
        <group ref={notesRef} position={[0, 0.08, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, i * 0.09, 0]}>
              <octahedronGeometry args={[0.02, 0]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? '#38bdf8' : '#f472b6'}
                emissive={i % 2 === 0 ? '#38bdf8' : '#f472b6'}
                emissiveIntensity={1.6}
              />
            </mesh>
          ))}
        </group>
      )}
      {hovered && (
        <Html position={[0, 0.34, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            🎵 Vinyl Lo-Fi · {isPlaying ? 'Playing (Click to Pause)' : 'Click to Play Binaural Beats'}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 8. Hydration Glass Water Bottle on Study Desk (Habit Sync)
 * ------------------------------------------------------------------ */
export const HydrationBottleProp: React.FC<{
  state: HydrationHabitState;
  onClick?: () => void;
}> = ({ state, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const waterHeight = 0.04 + state.waterFillRatio * 0.14;

  return (
    <group
      position={[-4.58, 0.782, 1.35]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
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
      {/* Clear Bottle Cylinder */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.036, 0.038, 0.2, 14]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.38} roughness={0.12} />
      </mesh>
      {/* Dynamic Inner Water Level */}
      <mesh position={[0, waterHeight / 2 + 0.008, 0]}>
        <cylinderGeometry args={[0.031, 0.032, waterHeight, 14]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0284c7"
          emissiveIntensity={state.hydratedToday ? 0.55 : 0.2}
          roughness={0.2}
        />
      </mesh>
      {/* Brushed Cap */}
      <mesh position={[0, 0.21, 0]} castShadow>
        <cylinderGeometry args={[0.026, 0.028, 0.026, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.25} />
      </mesh>
      {hovered && (
        <Html position={[0, 0.34, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            💧 Water Level: {Math.round(state.waterFillRatio * 100)}% {state.hydratedToday ? '(Hydrated!)' : '(Drink Water)'}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 9. Lv 10+ Outdoor Night Balcony & Lv 20+ Penthouse Sky Loft Expansion
 * ------------------------------------------------------------------ */
export const ApartmentExpansionStructure: React.FC<{
  expansion: ApartmentExpansionState;
  onClickBalcony?: () => void;
}> = ({ expansion, onClickBalcony }) => {
  const [hoveredChair, setHoveredChair] = useState(false);

  if (!expansion.hasBalcony) return null;

  return (
    <group>
      {/* Lv 10+ Outdoor Slate Terrace Balcony Outside Front-Left Patio (x=-7.2..-5.15, z=1.15..3.45) */}
      <group position={[-6.16, 0, 2.3]}>
        {/* Balcony Deck Base & Timber Planks */}
        <mesh position={[0, -0.18, 0]} receiveShadow>
          <boxGeometry args={[2.05, 0.36, 2.3]} />
          <meshStandardMaterial color="#192341" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.008, 0]} receiveShadow>
          <boxGeometry args={[1.95, 0.02, 2.2]} />
          <meshStandardMaterial color="#334155" roughness={0.55} />
        </mesh>

        {/* Sleek Glass & Steel Perimeter Railings */}
        <mesh position={[0, 0.48, 1.08]}>
          <boxGeometry args={[1.98, 0.88, 0.03]} />
          <meshStandardMaterial color="#93c5fd" transparent opacity={0.22} roughness={0.1} />
        </mesh>
        <mesh position={[-0.98, 0.48, 0]}>
          <boxGeometry args={[0.03, 0.88, 2.18]} />
          <meshStandardMaterial color="#93c5fd" transparent opacity={0.22} roughness={0.1} />
        </mesh>
        {/* Top Metal Handrails */}
        <mesh position={[0, 0.92, 1.08]} castShadow>
          <boxGeometry args={[2.02, 0.04, 0.06]} />
          <meshStandardMaterial
            color={expansion.hasPenthouse ? '#fbbf24' : '#94a3b8'}
            metalness={0.8}
            roughness={0.24}
          />
        </mesh>
        <mesh position={[-0.98, 0.92, 0]} castShadow>
          <boxGeometry args={[0.06, 0.04, 2.22]} />
          <meshStandardMaterial
            color={expansion.hasPenthouse ? '#fbbf24' : '#94a3b8'}
            metalness={0.8}
            roughness={0.24}
          />
        </mesh>

        {/* Outdoor Lounge Break Chair */}
        <group
          position={[-0.1, 0.02, 0.1]}
          rotation={[0, 0.65, 0]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onClickBalcony?.();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredChair(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredChair(false);
            document.body.style.cursor = 'auto';
          }}
        >
          <mesh position={[0, 0.24, 0]} castShadow>
            <boxGeometry args={[0.56, 0.14, 0.56]} />
            <meshStandardMaterial color="#1e3a8a" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.52, -0.24]} rotation={[0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.56, 0.5, 0.12]} />
            <meshStandardMaterial color="#2563eb" roughness={0.75} />
          </mesh>
          {hoveredChair && (
            <Html position={[0, 0.95, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
              <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-indigo-400/45 text-[10px] font-medium text-indigo-100 whitespace-nowrap shadow-lg">
                🌃 Outdoor Balcony Lounge
              </div>
            </Html>
          )}
        </group>

        {/* Warm Balcony Sconce Lamp */}
        <pointLight position={[0.45, 1.35, -0.4]} color="#fbbf24" intensity={0.95} distance={4.5} />

        {/* Lv 20+ Penthouse Extras: Brass Pergola Beams + Stargazing Telescope */}
        {expansion.hasPenthouse && (
          <group>
            {/* Brass Pergola Columns & Beams */}
            <mesh position={[-0.92, 1.6, -1.0]} castShadow>
              <boxGeometry args={[0.07, 3.2, 0.07]} />
              <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh position={[-0.92, 1.6, 1.0]} castShadow>
              <boxGeometry args={[0.07, 3.2, 0.07]} />
              <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.25} />
            </mesh>
            {[-0.8, -0.25, 0.3, 0.85].map((bz, idx) => (
              <mesh key={idx} position={[-0.45, 3.2, bz]} castShadow>
                <boxGeometry args={[1.1, 0.06, 0.06]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.25} />
              </mesh>
            ))}

            {/* Astronomical Brass Telescope */}
            <group position={[-0.55, 0.02, -0.58]} rotation={[0, 0.85, 0]}>
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.02, 0.03, 0.9, 10]} />
                <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0.92, 0.08]} rotation={[0.55, 0, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.032, 0.56, 14]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.2} />
              </mesh>
            </group>
          </group>
        )}
      </group>

      {/* Distant Midnight City Skyline Silhouettes Beyond Back Horizon */}
      <group position={[-1.0, -0.4, -7.2]}>
        {[
          { x: -6.2, h: 4.8, w: 1.3 },
          { x: -4.4, h: 6.4, w: 1.4 },
          { x: -2.2, h: 5.2, w: 1.2 },
          { x: 0.4, h: expansion.hasPenthouse ? 7.6 : 5.6, w: 1.5 },
          { x: 2.6, h: 4.9, w: 1.2 },
          { x: 4.6, h: expansion.hasPenthouse ? 6.8 : 4.5, w: 1.4 },
        ].map((b, idx) => (
          <group key={idx} position={[b.x, b.h / 2 - 1.4, -0.5 * (idx % 3)]}>
            <mesh>
              <boxGeometry args={[b.w, b.h, 1.0]} />
              <meshStandardMaterial color="#0b132b" roughness={0.9} />
            </mesh>
            {/* Glowing distant windows */}
            {[0.4, 1.1, 1.8].map((wy, wi) => (
              <mesh key={wi} position={[(wi % 2 === 0 ? -0.22 : 0.22), b.h * 0.25 - wy * 0.45, 0.51]}>
                <planeGeometry args={[0.16, 0.12]} />
                <meshBasicMaterial color={wi === 1 ? '#fde68a' : '#7dd3fc'} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
};

