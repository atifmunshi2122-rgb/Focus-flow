import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type {
  ConstellationStar,
  CustomWallFrameConfig,
  FocusAquariumState,
} from '../../features/home/homeShopAndLayout.ts';
import {
  playCoinClinkSound,
  playCradleTapSound,
  playSynthNoteSound,
} from '../../lib/homeSoundEffects.ts';

/* ------------------------------------------------------------------ *
 * 1. 3D Focus Aquarium (Desk Tank with Coral, Fish, Jellyfish & Mist)
 * ------------------------------------------------------------------ */
export const FocusDeskAquariumProp: React.FC<{ state: FocusAquariumState }> = ({ state }) => {
  const [hovered, setHovered] = useState(false);
  const fishGroupRef = useRef<THREE.Group | null>(null);
  const jellyRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (fishGroupRef.current) {
      fishGroupRef.current.children.forEach((fish, i) => {
        const sp = 0.85 + i * 0.22;
        fish.position.x = Math.sin(t * sp + i * 1.7) * 0.16;
        fish.position.z = Math.cos(t * sp * 0.8 + i * 1.1) * 0.06;
        fish.position.y = 0.54 + Math.sin(t * 1.9 + i) * 0.045;
        fish.rotation.y = Math.cos(t * sp + i * 1.7) >= 0 ? 0 : Math.PI;
      });
    }
    if (jellyRef.current && state.hasJellyfish) {
      jellyRef.current.position.y = 0.62 + Math.sin(t * 1.4) * 0.04;
      const pulse = 1 + Math.sin(t * 2.8) * 0.08;
      jellyRef.current.scale.set(pulse, 1 / pulse, pulse);
    }
  });

  return (
    <group
      position={[-3.82, 0, 2.38]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
      }}
    >
      {/* Pedestal Cabinet */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.4, 0.28]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
      {/* Illuminated Water Volume */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.48, 0.34, 0.24]} />
        <meshStandardMaterial
          color={state.isMisty ? '#94a3b8' : '#0ea5e9'}
          emissive={state.isMisty ? '#475569' : '#0284c7'}
          emissiveIntensity={state.isMisty ? 0.25 : 0.75}
          transparent
          opacity={state.isMisty ? 0.68 : 0.28}
          roughness={state.isMisty ? 0.75 : 0.08}
        />
      </mesh>
      {/* Sandy Bottom */}
      <mesh position={[0, 0.415, 0]}>
        <boxGeometry args={[0.46, 0.03, 0.22]} />
        <meshStandardMaterial color="#e7d5b8" roughness={0.92} />
      </mesh>

      {/* Coral Reef (1+ completed Pomodoro) */}
      {state.hasCoral && (
        <group position={[-0.12, 0.44, 0.02]}>
          <mesh position={[0, 0.04, 0]}>
            <coneGeometry args={[0.035, 0.09, 7]} />
            <meshStandardMaterial color="#fb7185" emissive="#e11d48" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0.05, 0.03, -0.03]} rotation={[0.2, 0, -0.3]}>
            <coneGeometry args={[0.025, 0.07, 7]} />
            <meshStandardMaterial color="#2dd4bf" emissive="#0d9488" emissiveIntensity={0.25} />
          </mesh>
        </group>
      )}

      {/* Swimming Tropical Fish */}
      <group ref={fishGroupRef}>
        {['#fb923c', '#facc15', '#38bdf8', '#f472b6'].slice(0, state.fishCount).map((fc, idx) => (
          <mesh key={idx} position={[0, 0.54, 0]}>
            <capsuleGeometry args={[0.015, 0.03, 4, 8]} />
            <meshStandardMaterial color={fc} emissive={fc} emissiveIntensity={0.5} />
          </mesh>
        ))}
      </group>

      {/* Glowing Jellyfish (6+ completed Pomodoros) */}
      {state.hasJellyfish && (
        <group ref={jellyRef} position={[0.12, 0.62, 0]}>
          <mesh>
            <sphereGeometry args={[0.036, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={1.4} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, -0.025, 0]}>
            <cylinderGeometry args={[0.008, 0.018, 0.05, 8]} />
            <meshStandardMaterial color="#e9d5ff" emissive="#c084fc" emissiveIntensity={1.1} transparent opacity={0.7} />
          </mesh>
        </group>
      )}

      <pointLight
        position={[0, 0.62, 0.1]}
        color={state.isMisty ? '#94a3b8' : '#38bdf8'}
        intensity={state.isMisty ? 0.2 : 0.65}
        distance={2.2}
      />

      {hovered && (
        <Html position={[0, 0.92, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-sky-400/45 text-[10px] font-medium text-sky-100 whitespace-nowrap shadow-lg">
            🐠 Focus Tank: {state.fishCount} fish{state.hasJellyfish ? ' + Jellyfish' : ''}{' '}
            {state.isMisty ? '· Misty (Do 1 focus to clear!)' : '· Crystal Clear'}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 2. Rooftop 3D Skill & Study Constellation Observatory Sky
 * ------------------------------------------------------------------ */
export const ConstellationSkyDomeProp: React.FC<{
  stars: ConstellationStar[];
  isObservatoryMode: boolean;
}> = ({ stars, isObservatoryMode }) => {
  const lineGeom = useMemo(() => {
    const unlocked = stars.filter((s) => s.unlocked);
    const points: number[] = [];
    for (let i = 0; i < unlocked.length - 1; i += 1) {
      points.push(...unlocked[i].pos, ...unlocked[i + 1].pos);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geom;
  }, [stars]);

  useEffect(() => {
    return () => {
      lineGeom.dispose();
    };
  }, [lineGeom]);

  return (
    <group>
      {stars.map((st) => (
        <group key={st.id} position={st.pos}>
          <mesh>
            <octahedronGeometry args={[st.unlocked ? 0.085 : 0.045, 0]} />
            <meshStandardMaterial
              color={st.color}
              emissive={st.color}
              emissiveIntensity={st.unlocked ? 2.1 : 0.4}
            />
          </mesh>
          {isObservatoryMode && (
            <Html position={[0, 0.16, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
              <div className="px-2 py-0.5 rounded-full bg-slate-950/85 border border-indigo-400/40 text-[10px] text-indigo-100 whitespace-nowrap">
                {st.kind === 'skill' ? '⚡ ' : st.kind === 'study' ? '📘 ' : '✦ '}
                {st.label}
              </div>
            </Html>
          )}
        </group>
      ))}
      {stars.filter((s) => s.unlocked).length >= 2 && (
        <lineSegments geometry={lineGeom}>
          <lineBasicMaterial color="#818cf8" transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 3. 3D Savings Coin-Drop Physics Jar
 * ------------------------------------------------------------------ */
interface FallingCoin {
  id: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  bounced: boolean;
}

export const SavingsCoinDropPhysicsJarProp: React.FC<{
  totalSavedPaise: number;
  dropSeq: number;
  onDropBonusCoin?: () => void;
}> = ({ totalSavedPaise, dropSeq, onDropBonusCoin }) => {
  const [hovered, setHovered] = useState(false);
  const fallingRef = useRef<FallingCoin[]>([]);
  const prevSavedRef = useRef<number>(totalSavedPaise);
  const prevSeqRef = useRef<number>(dropSeq);
  const coinsGroupRef = useRef<THREE.Group | null>(null);

  const staticCount = Math.min(20, Math.max(0, Math.floor(totalSavedPaise / 50000)));
  const pileTopY = 0.1 + staticCount * 0.008;

  const spawnPhysicsCoin = () => {
    const id = Date.now() + Math.random();
    fallingRef.current.push({
      id,
      x: (Math.random() - 0.5) * 0.08,
      y: 0.72,
      z: (Math.random() - 0.5) * 0.08,
      vy: 0,
      bounced: false,
    });
    if (fallingRef.current.length > 5) fallingRef.current.shift();
  };

  useEffect(() => {
    if (totalSavedPaise > prevSavedRef.current) {
      spawnPhysicsCoin();
    }
    prevSavedRef.current = totalSavedPaise;
  }, [totalSavedPaise]);

  useEffect(() => {
    if (dropSeq > prevSeqRef.current) {
      spawnPhysicsCoin();
    }
    prevSeqRef.current = dropSeq;
  }, [dropSeq]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const active = fallingRef.current;
    if (!coinsGroupRef.current) return;

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const c = active[i];
      c.vy -= 7.8 * dt;
      c.y += c.vy * dt;
      if (c.y <= pileTopY) {
        c.y = pileTopY;
        if (!c.bounced) {
          c.bounced = true;
          c.vy = Math.abs(c.vy) * 0.38;
          playCoinClinkSound();
        } else if (Math.abs(c.vy) < 0.25) {
          active.splice(i, 1);
        } else {
          c.vy = Math.abs(c.vy) * 0.3;
        }
      }
    }

    coinsGroupRef.current.children.forEach((mesh, idx) => {
      const coin = active[idx];
      if (!coin) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(coin.x, coin.y, coin.z);
    });
  });

  return (
    <group
      position={[-3.82, 0, 2.95]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        spawnPhysicsCoin();
        onDropBonusCoin?.();
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
      {/* Brass Pedestal Base */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.17, 0.08, 18]} />
        <meshStandardMaterial color="#b45309" metalness={0.75} roughness={0.28} />
      </mesh>
      {/* Clear Glass Jar */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.135, 0.135, 0.4, 20]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.32} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* Stacked Saved Coins */}
      {Array.from({ length: staticCount }).map((_, idx) => {
        const ang = idx * 1.9;
        return (
          <mesh
            key={idx}
            position={[Math.cos(ang) * 0.045, 0.095 + idx * 0.011, Math.sin(ang) * 0.045]}
          >
            <cylinderGeometry args={[0.032, 0.032, 0.01, 12]} />
            <meshStandardMaterial
              color={idx % 3 === 0 ? '#e2e8f0' : '#fbbf24'}
              metalness={0.85}
              roughness={0.22}
            />
          </mesh>
        );
      })}
      {/* Pre-allocated Physics Falling Coins Pool */}
      <group ref={coinsGroupRef}>
        {[0, 1, 2, 3, 4].map((slot) => (
          <mesh key={slot} visible={false}>
            <cylinderGeometry args={[0.034, 0.034, 0.011, 12]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.45} metalness={0.9} />
          </mesh>
        ))}
      </group>
      {hovered && (
        <Html position={[0, 0.6, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-amber-400/45 text-[10px] font-medium text-amber-100 whitespace-nowrap shadow-lg">
            🪙 Savings Jar: ₹{Math.round(totalSavedPaise / 100).toLocaleString('en-IN')} · Click to clink coin!
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 4. Audio-Reactive 3D Desk Speakers & Wall Equalizer Bar
 * ------------------------------------------------------------------ */
export const AudioReactiveSpeakersAndEqProp: React.FC<{ active: boolean }> = ({ active }) => {
  const speakerLeftConeRef = useRef<THREE.Mesh | null>(null);
  const speakerRightConeRef = useRef<THREE.Mesh | null>(null);
  const eqBarsRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = active ? 1 + Math.sin(t * 14) * 0.12 : 1;
    if (speakerLeftConeRef.current) speakerLeftConeRef.current.scale.set(pulse, pulse, pulse);
    if (speakerRightConeRef.current) speakerRightConeRef.current.scale.set(pulse, pulse, pulse);

    if (eqBarsRef.current) {
      eqBarsRef.current.children.forEach((bar, i) => {
        const targetScaleY = active ? 0.25 + Math.abs(Math.sin(t * (5 + i * 0.9) + i)) * 1.35 : 0.14;
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, targetScaleY, 0.25);
      });
    }
  });

  return (
    <group>
      {/* Left & Right Study Desk Studio Monitor Speakers */}
      {[
        { z: 0.86, ref: speakerLeftConeRef },
        { z: 1.54, ref: speakerRightConeRef },
      ].map((sp, i) => (
        <group key={i} position={[-4.76, 0.78, sp.z]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.13, 0.22, 0.14]} />
            <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh ref={sp.ref} position={[0, 0.085, 0.072]}>
            <cylinderGeometry args={[0.042, 0.042, 0.01, 16]} />
            <meshStandardMaterial
              color="#334155"
              emissive={active ? '#38bdf8' : '#000000'}
              emissiveIntensity={active ? 0.75 : 0}
            />
          </mesh>
        </group>
      ))}

      {/* Wall 8-Band Equalizer Strip Above Headphones */}
      <group position={[-4.95, 1.98, 1.13]}>
        <mesh castShadow>
          <boxGeometry args={[0.025, 0.18, 0.54]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </mesh>
        <group ref={eqBarsRef} position={[0.018, -0.055, 0]}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
            <mesh key={idx} position={[0, 0.05, -0.21 + idx * 0.06]}>
              <boxGeometry args={[0.01, 0.09, 0.036]} />
              <meshStandardMaterial
                color={idx % 2 === 0 ? '#38bdf8' : '#c084fc'}
                emissive={active ? (idx % 2 === 0 ? '#38bdf8' : '#c084fc') : '#1e293b'}
                emissiveIntensity={active ? 1.55 : 0.1}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 5. Break-Time 3D Interactive Desk Toys (Newton Cradle, Globe, Piano)
 * ------------------------------------------------------------------ */
const SYNTH_NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C4 pentatonic

export const BreakTimeInteractiveDeskToysProp: React.FC = () => {
  const cradleAmpRef = useRef(0);
  const cradleLeftRef = useRef<THREE.Mesh | null>(null);
  const cradleRightRef = useRef<THREE.Mesh | null>(null);
  const globeVelRef = useRef(0.35);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const [pressedKeyIdx, setPressedKeyIdx] = useState<number | null>(null);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.05, delta);
    const t = clock.elapsedTime;

    if (cradleAmpRef.current > 0.01) {
      cradleAmpRef.current *= Math.exp(-1.1 * dt);
      const swing = Math.sin(t * 7.5) * cradleAmpRef.current;
      if (cradleLeftRef.current) cradleLeftRef.current.position.z = swing < 0 ? swing * 0.06 : 0;
      if (cradleRightRef.current) cradleRightRef.current.position.z = swing > 0 ? swing * 0.06 : 0;
    }

    if (globeMeshRef.current) {
      globeMeshRef.current.rotation.y += globeVelRef.current * dt;
      globeVelRef.current = THREE.MathUtils.lerp(globeVelRef.current, 0.22, 1 - Math.exp(-1.4 * dt));
    }
  });

  return (
    <group>
      {/* 1. Newton's Cradle */}
      <group
        position={[-4.12, 0.782, 0.38]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          cradleAmpRef.current = 0.85;
          playCradleTapSound();
        }}
      >
        <mesh position={[0, 0.01, 0]} castShadow>
          <boxGeometry args={[0.1, 0.016, 0.16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.075, -0.065]}>
          <cylinderGeometry args={[0.004, 0.004, 0.13, 6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.075, 0.065]}>
          <cylinderGeometry args={[0.004, 0.004, 0.13, 6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.13, 6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} />
        </mesh>
        <mesh ref={cradleLeftRef} position={[0, 0.055, -0.036]}>
          <sphereGeometry args={[0.012, 10, 10]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.15} />
        </mesh>
        {[-0.012, 0.012].map((zOff, i) => (
          <mesh key={i} position={[0, 0.055, zOff]}>
            <sphereGeometry args={[0.012, 10, 10]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.15} />
          </mesh>
        ))}
        <mesh ref={cradleRightRef} position={[0, 0.055, 0.036]}>
          <sphereGeometry args={[0.012, 10, 10]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.15} />
        </mesh>
      </group>

      {/* 2. Spinning 3D Fidget Globe */}
      <group
        position={[-4.14, 0.782, 0.65]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          globeVelRef.current = 12.0;
        }}
      >
        <mesh position={[0, 0.01, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.048, 0.016, 14]} />
          <meshStandardMaterial color="#b45309" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh ref={globeMeshRef} position={[0, 0.075, 0]} castShadow>
          <sphereGeometry args={[0.052, 14, 14]} />
          <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={0.2} roughness={0.4} />
        </mesh>
      </group>

      {/* 3. Mini 3D Synth / Piano Keys (Real Web Audio Notes) */}
      <group position={[-4.14, 0.782, 1.62]}>
        <mesh position={[0, 0.01, 0]} castShadow>
          <boxGeometry args={[0.12, 0.02, 0.24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.45} />
        </mesh>
        {SYNTH_NOTES.map((freq, idx) => {
          const pressed = pressedKeyIdx === idx;
          return (
            <mesh
              key={idx}
              position={[0.012, pressed ? 0.018 : 0.024, -0.088 + idx * 0.035]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                setPressedKeyIdx(idx);
                playSynthNoteSound(freq);
                window.setTimeout(() => setPressedKeyIdx((c) => (c === idx ? null : c)), 180);
              }}
            >
              <boxGeometry args={[0.075, 0.014, 0.028]} />
              <meshStandardMaterial
                color={pressed ? '#38bdf8' : '#f8fafc'}
                emissive={pressed ? '#38bdf8' : '#000000'}
                emissiveIntensity={pressed ? 0.9 : 0}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 6. Custom Photo & Poster Wall Picture Frames
 * ------------------------------------------------------------------ */
export const CustomWallPhotoFrameProp: React.FC<{
  config: CustomWallFrameConfig;
  position: [number, number, number];
  rotationY: number;
  isVisiting: boolean;
  onClickFrame?: () => void;
}> = ({ config, position, rotationY, isVisiting, onClickFrame }) => {
  const [hovered, setHovered] = useState(false);

  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
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

    const drawPreset = () => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      if (config.preset === 'sakura_horizon') {
        grad.addColorStop(0, '#3b0764');
        grad.addColorStop(1, '#f43f5e');
      } else if (config.preset === 'focus_grid') {
        grad.addColorStop(0, '#064e3b');
        grad.addColorStop(1, '#0284c7');
      } else {
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#4f46e5');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 14, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(config.title.slice(0, 20), w / 2, h - 26);
      texture.needsUpdate = true;
    };

    if (!config.imageDataUrl || typeof Image === 'undefined') {
      drawPreset();
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.drawImage(img, 0, 0, w, h);
      texture.needsUpdate = true;
    };
    img.onerror = () => {
      if (!cancelled) drawPreset();
    };
    img.src = config.imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [canvas, texture, config.preset, config.title, config.imageDataUrl]);

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClickFrame?.();
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
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.38, 0.035]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[0.43, 0.31]} />
          <meshStandardMaterial map={texture} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.28} />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, 0.3, 0.05]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-indigo-400/45 text-[10px] font-medium text-indigo-100 whitespace-nowrap shadow-lg">
            {isVisiting ? config.title : `🖼️ ${config.title} · Click to customize`}
          </div>
        </Html>
      )}
    </group>
  );
};

