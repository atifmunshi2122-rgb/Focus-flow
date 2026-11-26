import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type {
  CalendarSeasonState,
  CorkboardTaskNote,
  ExamCountdownSummary,
} from '../../features/home/homeFeaturesEngine.ts';

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): void {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let line = '';
  let lineIdx = 0;

  for (let i = 0; i < words.length; i += 1) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width > maxWidth && line) {
      if (lineIdx + 1 >= maxLines) {
        let truncated = `${line}...`;
        while (ctx.measureText(truncated).width > maxWidth && truncated.length > 4) {
          truncated = `${truncated.slice(0, -4)}...`;
        }
        ctx.fillText(truncated, x, y + lineIdx * lineHeight);
        return;
      }
      ctx.fillText(line, x, y + lineIdx * lineHeight);
      line = words[i];
      lineIdx += 1;
    } else {
      line = candidate;
    }
  }
  if (line) {
    let finalLine = line;
    while (ctx.measureText(finalLine).width > maxWidth && finalLine.length > 4) {
      finalLine = `${finalLine.slice(0, -4)}...`;
    }
    ctx.fillText(finalLine, x, y + lineIdx * lineHeight);
  }
}

/* ------------------------------------------------------------------ *
 * 1. Live 3D Laptop Screen (Pomodoro / Focus Timer Canvas Texture)
 * ------------------------------------------------------------------ */
export const LiveLaptopDisplay: React.FC<{
  timerLabel: string;
  modeLabel: string;
  isRunning: boolean;
  isSleeping: boolean;
  progressRatio: number;
  subtitle: string;
}> = ({ timerLabel, modeLabel, isRunning, isSleeping, progressRatio, subtitle }) => {
  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') {
      return { texture: null, canvas: null };
    }
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
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
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, w, h);
    if (isSleeping) {
      bg.addColorStop(0, '#090d1a');
      bg.addColorStop(1, '#111827');
    } else {
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(1, '#1e1b4b');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle top bar
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, w, 30);

    ctx.fillStyle = isRunning ? '#f87171' : '#34d399';
    ctx.beginPath();
    ctx.arc(20, 15, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FOCUSFLOW OS', 34, 19);

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(modeLabel.toUpperCase(), w - 16, 19);

    // Circular progress arc behind digital clock
    const cx = w / 2;
    const cy = 104;
    const r = 56;
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const pct = Math.max(0, Math.min(1, progressRatio));
    ctx.strokeStyle = isSleeping ? '#38bdf8' : isRunning ? '#f59e0b' : '#818cf8';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();

    // Big crisp timer clock
    ctx.fillStyle = isSleeping ? '#94a3b8' : '#f8fafc';
    ctx.font = 'bold 40px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(timerLabel, cx, cy + 13);

    // Bottom subtitle
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle.slice(0, 32), cx, h - 18);

    texture.needsUpdate = true;
  }, [canvas, texture, timerLabel, modeLabel, isRunning, isSleeping, progressRatio, subtitle]);

  if (!texture) return null;

  return (
    <mesh position={[0.011, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[0.38, 0.24]} />
      <meshStandardMaterial
        map={texture}
        emissive="#ffffff"
        emissiveMap={texture}
        emissiveIntensity={isSleeping ? 0.32 : isRunning ? 1.15 : 0.9}
        roughness={0.28}
      />
    </mesh>
  );
};

/* ------------------------------------------------------------------ *
 * 2. Wall Exam Countdown & Daily Focus Target Frame
 * ------------------------------------------------------------------ */
export const LiveExamCountdownFrame: React.FC<{
  summary: ExamCountdownSummary;
  isVisiting: boolean;
  onClickFrame?: () => void;
}> = ({ summary, isVisiting, onClickFrame }) => {
  const [hovered, setHovered] = useState(false);

  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 288;
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

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, summary.isExamWeek ? '#3b0764' : '#172554');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Top status header ribbon
    ctx.fillStyle = summary.isExamWeek
      ? '#e11d48'
      : summary.hasExam
        ? '#4f46e5'
        : '#0284c7';
    ctx.fillRect(0, 0, w, 46);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      summary.isExamWeek
        ? 'EXAM WEEK COUNTDOWN'
        : summary.hasExam
          ? 'NEXT EXAM TARGET'
          : 'DAILY FOCUS TARGET',
      w / 2,
      29
    );

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    drawWrappedText(ctx, summary.examTitle, w / 2, 92, w - 40, 28, 2);

    // Main Days Left badge
    if (summary.hasExam && summary.daysLeft !== null) {
      ctx.fillStyle = summary.isExamWeek ? '#fda4af' : '#fbbf24';
      ctx.font = 'bold 46px system-ui, -apple-system, sans-serif';
      const badge =
        summary.daysLeft === 0
          ? 'TODAY!'
          : summary.daysLeft === 1
            ? '1 DAY LEFT'
            : `${summary.daysLeft} DAYS LEFT`;
      ctx.fillText(badge, w / 2, 168);
    } else {
      ctx.fillStyle = '#7dd3fc';
      ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
      ctx.fillText('Click Frame to Set Exam', w / 2, 158);
    }

    // Bottom Daily Focus Target bar
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `Today: ${summary.todayFocusMinutes} / ${summary.dailyGoalMinutes} min (${summary.dailyTargetPct}%)`,
      w / 2,
      224
    );

    const barX = 44;
    const barY = 240;
    const barW = w - 88;
    const barH = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 7);
    ctx.fill();

    const fillW = Math.max(8, Math.round((summary.dailyTargetPct / 100) * barW));
    ctx.fillStyle = summary.dailyTargetPct >= 100 ? '#34d399' : '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, 7);
    ctx.fill();

    texture.needsUpdate = true;
  }, [canvas, texture, summary]);

  return (
    <group
      position={[-3.72, 2.02, -3.41]}
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
      {/* Oak Frame */}
      <mesh castShadow>
        <boxGeometry args={[1.06, 0.84, 0.045]} />
        <meshStandardMaterial color="#8e4d20" roughness={0.48} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.94, 0.72]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={0.45}
            roughness={0.35}
          />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, 0.56, 0.05]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/90 border border-indigo-400/45 text-[10px] font-medium text-indigo-100 whitespace-nowrap shadow-lg">
            {isVisiting
              ? `${summary.examTitle} (${summary.daysLeft ?? '-'}d left)`
              : 'Exam & Daily Goal Frame · Click to edit'}
          </div>
        </Html>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 3. Real Interactive Sticky Note Cards on Corkboard
 * ------------------------------------------------------------------ */
const StickyNoteCard: React.FC<{
  note: CorkboardTaskNote;
  position: [number, number, number];
  rotX: number;
  isCompletedFlash: boolean;
  onClickNote: () => void;
}> = ({ note, position, rotX, isCompletedFlash, onClickNote }) => {
  const [hovered, setHovered] = useState(false);

  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 140;
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
    ctx.fillStyle = isCompletedFlash ? '#10b981' : note.noteColor;
    ctx.fillRect(0, 0, w, h);

    if (isCompletedFlash) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', w / 2, 74);
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('DONE!', w / 2, 108);
    } else {
      ctx.fillStyle = note.isOverdue ? '#9a3412' : '#1e293b';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      const badge = note.isOverdue ? 'OVERDUE' : note.priority.toUpperCase();
      ctx.fillText(`• ${badge}`, 14, 28);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
      drawWrappedText(ctx, note.title, 14, 62, w - 28, 24, 3);
    }

    texture.needsUpdate = true;
  }, [canvas, texture, note.noteColor, note.isOverdue, note.priority, note.title, isCompletedFlash]);

  return (
    <group
      position={position}
      rotation={[rotX, 0, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClickNote();
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
      {/* Paper backing */}
      <mesh castShadow>
        <boxGeometry args={[0.008, 0.21, 0.31]} />
        <meshStandardMaterial color={isCompletedFlash ? '#10b981' : note.noteColor} roughness={0.85} />
      </mesh>
      {texture && (
        <mesh position={[0.005, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.3, 0.2]} />
          <meshStandardMaterial map={texture} roughness={0.82} />
        </mesh>
      )}
      {/* Pushpin */}
      <mesh position={[0.012, 0.085, 0]}>
        <sphereGeometry args={[0.013, 10, 10]} />
        <meshStandardMaterial color={note.isOverdue ? '#ef4444' : '#3b82f6'} roughness={0.35} />
      </mesh>

      {hovered && (
        <Html position={[0.08, 0.16, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="px-2.5 py-1 rounded-full bg-slate-950/92 border border-emerald-400/45 text-[10px] font-medium text-emerald-100 whitespace-nowrap shadow-lg">
            ✔ Complete: {note.title}
          </div>
        </Html>
      )}
    </group>
  );
};

export const CorkboardRealStickyNotes: React.FC<{
  notes: CorkboardTaskNote[];
  isVisiting: boolean;
  onCompleteTask?: (taskId: string) => void;
  onOpenSchedulePopup?: () => void;
}> = ({ notes, isVisiting, onCompleteTask, onOpenSchedulePopup }) => {
  const [completedFlashIds, setCompletedFlashIds] = useState<Record<string, boolean>>({});
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const slots: Array<{ pos: [number, number, number]; rotX: number }> = [
    { pos: [0.025, 1.5, -0.21], rotX: -0.04 },
    { pos: [0.025, 1.5, 0.21], rotX: 0.05 },
    { pos: [0.025, 1.24, -0.2], rotX: 0.03 },
    { pos: [0.025, 1.24, 0.2], rotX: -0.05 },
  ];

  if (notes.length === 0) {
    return (
      <group
        position={[0.025, 1.38, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onOpenSchedulePopup?.();
        }}
      >
        <mesh castShadow>
          <boxGeometry args={[0.008, 0.2, 0.34]} />
          <meshStandardMaterial color="#a7f3d0" roughness={0.85} />
        </mesh>
        <mesh position={[0.012, 0.075, 0]}>
          <sphereGeometry args={[0.013, 10, 10]} />
          <meshStandardMaterial color="#10b981" roughness={0.35} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      {notes.slice(0, 4).map((note, idx) => {
        const slot = slots[idx] || slots[0];
        const isFlashing = Boolean(completedFlashIds[note.id]);
        return (
          <StickyNoteCard
            key={note.id}
            note={note}
            position={slot.pos}
            rotX={slot.rotX}
            isCompletedFlash={isFlashing}
            onClickNote={() => {
              if (isVisiting) {
                onOpenSchedulePopup?.();
                return;
              }
              setCompletedFlashIds((prev) => ({ ...prev, [note.id]: true }));
              const tid = window.setTimeout(() => {
                onCompleteTask?.(note.id);
              }, 420);
              timersRef.current.push(tid);
            }}
          />
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 4. Calendar Seasons & Special Days 3D Props
 * ------------------------------------------------------------------ */
export const SeasonalAndSpecialProps: React.FC<{
  seasonState: CalendarSeasonState;
  isRainingNow: boolean;
}> = ({ seasonState, isRainingNow }) => {
  const teaSteamRef = useRef<THREE.Group | null>(null);
  const snowGroupRef = useRef<THREE.Group | null>(null);
  const candleLightRef = useRef<THREE.PointLight | null>(null);

  const snowDrops = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; speed: number; radius: number }> = [];
    for (let i = 0; i < 48; i += 1) {
      const s1 = ((i * 59) % 100) / 100;
      const s2 = ((i * 83) % 100) / 100;
      const s3 = ((i * 41) % 100) / 100;
      out.push({
        x: -5.3 - s1 * 1.05,
        y: 0.4 + s2 * 3.1,
        z: -1.8 + s3 * 2.9,
        speed: 0.9 + (i % 4) * 0.25,
        radius: 0.018 + (i % 3) * 0.006,
      });
    }
    return out;
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;

    if (teaSteamRef.current && seasonState.showHotTeaMug) {
      teaSteamRef.current.children.forEach((c, i) => {
        const phase = (t * 0.65 + i * 0.35) % 1;
        c.position.y = 0.04 + phase * 0.22;
        c.position.x = Math.sin(t * 2 + i) * 0.015;
        const s = 0.7 + phase * 0.6;
        c.scale.set(s, s, s);
      });
    }

    if (snowGroupRef.current && seasonState.showSnowWindow && !isRainingNow) {
      snowGroupRef.current.children.forEach((mesh, i) => {
        const seed = snowDrops[i];
        if (!seed) return;
        mesh.position.y -= seed.speed * dt;
        mesh.position.z += Math.sin(t * 1.4 + i) * 0.16 * dt;
        if (mesh.position.y < 0.35) {
          mesh.position.y = 3.55;
          mesh.position.z = seed.z;
        }
      });
    }

    if (candleLightRef.current && seasonState.isBirthdayToday) {
      candleLightRef.current.intensity = 0.72 + Math.sin(t * 11) * 0.12;
    }
  });

  return (
    <group>
      {/* Monsoon / Winter Hot Tea Mug on Study Desk */}
      {seasonState.showHotTeaMug && (
        <group position={[-4.36, 0.782, 1.56]}>
          {/* Ceramic saucer */}
          <mesh position={[0, 0.006, 0]} receiveShadow>
            <cylinderGeometry args={[0.072, 0.056, 0.012, 16]} />
            <meshStandardMaterial color="#f5f5f4" roughness={0.35} />
          </mesh>
          {/* Warm terracotta ceramic tea mug */}
          <mesh position={[0, 0.054, 0]} castShadow>
            <cylinderGeometry args={[0.044, 0.038, 0.088, 16]} />
            <meshStandardMaterial color="#ea580c" roughness={0.45} />
          </mesh>
          {/* Hot masala chai surface */}
          <mesh position={[0, 0.094, 0]}>
            <cylinderGeometry args={[0.039, 0.039, 0.008, 14]} />
            <meshStandardMaterial color="#b45309" roughness={0.25} />
          </mesh>
          {/* Rising steam puffs */}
          <group ref={teaSteamRef} position={[0, 0.11, 0]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[0, i * 0.06, 0]}>
                <sphereGeometry args={[0.022, 8, 8]} />
                <meshStandardMaterial color="#f8fafc" transparent opacity={0.38} roughness={1} />
              </mesh>
            ))}
          </group>
        </group>
      )}

      {/* Winter Soft Falling Snowflakes Outside Window */}
      {seasonState.showSnowWindow && !isRainingNow && (
        <group ref={snowGroupRef}>
          {snowDrops.map((d, i) => (
            <mesh key={i} position={[d.x, d.y, d.z]}>
              <sphereGeometry args={[d.radius, 6, 6]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={0.45} />
            </mesh>
          ))}
        </group>
      )}

      {/* Exam Week Extra Reference Books + Highlighters on Study Desk */}
      {seasonState.showExamWeekBooks && (
        <group position={[-4.62, 0.78, 0.14]}>
          <mesh position={[0, 0.026, 0]} rotation={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.25, 0.052, 0.19]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.62} />
          </mesh>
          <mesh position={[0.01, 0.072, -0.01]} rotation={[0, -0.1, 0]} castShadow>
            <boxGeometry args={[0.23, 0.042, 0.18]} />
            <meshStandardMaterial color="#be123c" roughness={0.62} />
          </mesh>
          <mesh position={[-0.01, 0.112, 0.01]} rotation={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.21, 0.036, 0.16]} />
            <meshStandardMaterial color="#0f766e" roughness={0.6} />
          </mesh>
          {/* Neon highlighter pens */}
          <mesh position={[0.16, 0.01, 0.05]} rotation={[0, 0.4, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.009, 0.009, 0.13, 8]} />
            <meshStandardMaterial color="#facc15" emissive="#eab308" emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}

      {/* Birthday Celebration Cake on Dining Table */}
      {seasonState.isBirthdayToday && (
        <group position={[0.14, 0.77, 1.18]}>
          {/* Gold pedestal stand */}
          <mesh position={[0, 0.012, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.15, 0.024, 20]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
          </mesh>
          {/* Lower frosted sponge tier */}
          <mesh position={[0, 0.07, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.09, 20]} />
            <meshStandardMaterial color="#fce7f3" roughness={0.6} />
          </mesh>
          {/* Strawberry frosting drip top */}
          <mesh position={[0, 0.118, 0]}>
            <cylinderGeometry args={[0.152, 0.152, 0.014, 20]} />
            <meshStandardMaterial color="#f43f5e" roughness={0.42} />
          </mesh>
          {/* Upper tier */}
          <mesh position={[0, 0.156, 0]} castShadow>
            <cylinderGeometry args={[0.095, 0.095, 0.068, 18]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.62} />
          </mesh>
          {/* 3 Birthday Candles + glowing tips */}
          {[-0.035, 0, 0.035].map((cx, i) => (
            <group key={i} position={[cx, 0.19, i === 1 ? -0.025 : 0.02]}>
              <mesh position={[0, 0.03, 0]}>
                <cylinderGeometry args={[0.008, 0.008, 0.06, 8]} />
                <meshStandardMaterial color={i % 2 === 0 ? '#38bdf8' : '#f472b6'} />
              </mesh>
              <mesh position={[0, 0.068, 0]}>
                <sphereGeometry args={[0.012, 8, 8]} />
                <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={2.2} />
              </mesh>
            </group>
          ))}
          <pointLight ref={candleLightRef} position={[0, 0.34, 0]} color="#fbbf24" intensity={0.75} distance={2.2} />
        </group>
      )}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 5. "Out for Class / Outside" Door Placard Sign
 * ------------------------------------------------------------------ */
export const OutForClassDoorPlacard: React.FC<{
  visible: boolean;
  label: string;
}> = ({ visible, label }) => {
  const { texture, canvas } = useMemo(() => {
    if (typeof document === 'undefined') return { texture: null, canvas: null };
    const c = document.createElement('canvas');
    c.width = 280;
    c.height = 150;
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
    if (!canvas || !texture || !visible) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, w, 38);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OUT FOR CLASS', w / 2, 25);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px system-ui, sans-serif';
    drawWrappedText(ctx, label, w / 2, 84, w - 24, 24, 2);

    texture.needsUpdate = true;
  }, [canvas, texture, visible, label]);

  if (!visible) return null;

  return (
    <group position={[2.18, 0, 2.75]} rotation={[0, -0.35, 0]}>
      {/* Wooden A-Frame Sign Post */}
      <mesh position={[0, 0.56, 0]} castShadow>
        <boxGeometry args={[0.72, 0.44, 0.04]} />
        <meshStandardMaterial color="#8e4d20" roughness={0.55} />
      </mesh>
      <mesh position={[-0.28, 0.28, 0]} castShadow>
        <boxGeometry args={[0.05, 0.56, 0.05]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>
      <mesh position={[0.28, 0.28, 0]} castShadow>
        <boxGeometry args={[0.05, 0.56, 0.05]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>
      {texture && (
        <mesh position={[0, 0.56, 0.023]}>
          <planeGeometry args={[0.64, 0.36]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={0.45}
          />
        </mesh>
      )}
    </group>
  );
};
