/**
 * FocusFlow & Finance — Development-Only Avatar Visual QA Mode (#avatar_qa)
 *
 * Strictly gated by `import.meta.env.DEV` and legitimate Firebase Authentication.
 * Never weakens security rules, never fakes skeletal animation on unrigged meshes,
 * and never duplicates the 3 existing Study Room components.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  LampDesk,
  Layers,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import {
  getAvatarCatalogEntry,
  type AvatarCatalogEntry,
} from '../../features/avatar/avatar-catalog.ts';
import type { AvatarEmote, AvatarEmoteEvent } from '../../features/study-room/types.ts';
import type { RigCapabilities } from '../../features/study-room/humanoidRigController.ts';
import StudyAvatar, { type StudyAvatarActivity } from '../study-room/StudyAvatar.tsx';
import { ThemeButton } from '../ui/ThemePrimitives.tsx';

export const QA_AVATAR_IDS = ['avatar-01', 'avatar-02'] as const;
export type QAAvatarId = (typeof QA_AVATAR_IDS)[number];

export type CameraViewPreset = 'front' | 'side' | 'back' | 'three_quarter';

export const CAMERA_PRESETS: Record<
  CameraViewPreset,
  { label: string; position: [number, number, number]; target: [number, number, number] }
> = {
  front: { label: 'Front', position: [0, 0.28, 3.05], target: [0, 0.02, 0] },
  side: { label: 'Side', position: [3.05, 0.28, 0], target: [0, 0.02, 0] },
  back: { label: 'Back', position: [0, 0.28, -3.05], target: [0, 0.02, 0] },
  three_quarter: { label: '3/4 View', position: [2.15, 0.38, 2.25], target: [0, 0.02, 0] },
};

export const VISUAL_QA_CHECKLIST_ITEMS = [
  { id: 'face', label: 'Face looks correct' },
  { id: 'eyes', label: 'Eyes are clearly visible' },
  { id: 'hair', label: 'Hair renders correctly' },
  { id: 'clothing', label: 'Clothing materials look correct' },
  { id: 'extremities', label: 'Hands and feet are visible' },
  { id: 'proportions', label: 'Body proportions look natural' },
  { id: 'no_clipping', label: 'No mesh clipping' },
  { id: 'no_floating', label: 'No floating' },
  { id: 'scale', label: 'Correct character scale' },
  { id: 'framing', label: 'Camera framing is correct' },
  { id: 'nameplate', label: 'Nameplate position is correct' },
  { id: 'animation', label: 'Animation looks natural' },
] as const;

type ChecklistStatus = 'pending' | 'pass' | 'needs_fix';

const QA_CHECKLIST_STORAGE_KEY = 'ff_dev_avatar_qa_checklist_v1';

const RIGGED_ACTIVITIES: Array<{ id: StudyAvatarActivity; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'studying', label: 'Studying' },
  { id: 'typing', label: 'Typing' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
  { id: 'walking', label: 'Walking' },
];

const RIGGED_EMOTES: Array<{ id: AvatarEmote; label: string }> = [
  { id: 'wave', label: 'Wave' },
  { id: 'celebrate', label: 'Celebrate' },
  { id: 'clap', label: 'Clap' },
];

interface QACameraControllerProps {
  preset: CameraViewPreset;
  zoomFactor: number;
  resetCounter: number;
}

const QACameraController: React.FC<QACameraControllerProps> = ({
  preset,
  zoomFactor,
  resetCounter,
}) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const cfg = CAMERA_PRESETS[preset];
    camera.position.set(
      cfg.position[0] * zoomFactor,
      cfg.position[1],
      cfg.position[2] * zoomFactor
    );
    if (controlsRef.current) {
      controlsRef.current.target.set(cfg.target[0], cfg.target[1], cfg.target[2]);
      controlsRef.current.update();
    }
  }, [camera, preset, zoomFactor, resetCounter]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={1.4}
      maxDistance={5.2}
      minPolarAngle={Math.PI / 8}
      maxPolarAngle={Math.PI / 1.85}
    />
  );
};

export const AvatarQAView: React.FC = () => {
  const { firebaseUser, isAuthenticated, signInWithGoogle, setCurrentTab, showToast } = useApp();

  const [selectedAvatarId, setSelectedAvatarId] = useState<QAAvatarId>('avatar-01');
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('front');
  const [zoomFactor, setZoomFactor] = useState<number>(1);
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [showNameplate, setShowNameplate] = useState<boolean>(false);

  // Animation controls
  const [poseMode, setPoseMode] = useState<'standing' | 'seated'>('standing');
  const [activity, setActivity] = useState<StudyAvatarActivity>('idle');
  const [emoteEvent, setEmoteEvent] = useState<AvatarEmoteEvent | null>(null);

  // Live GLB inspection state (from actual Three.js scene graph, never hardcoded)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspectedRig, setInspectedRig] = useState<RigCapabilities | null>(null);

  // Canvas reference for real WebGL PNG screenshot capture
  const canvasDomRef = useRef<HTMLCanvasElement | null>(null);
  const [capturedFiles, setCapturedFiles] = useState<string[]>([]);

  // Local QA session checklist state (keyed by avatarId -> itemId -> status)
  const [checklistByAvatar, setChecklistByAvatar] = useState<
    Record<QAAvatarId, Record<string, ChecklistStatus>>
  >(() => {
    try {
      const raw = localStorage.getItem(QA_CHECKLIST_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
    return { 'avatar-01': {}, 'avatar-02': {} };
  });

  const catalogEntry: AvatarCatalogEntry = useMemo(
    () => getAvatarCatalogEntry(selectedAvatarId),
    [selectedAvatarId]
  );

  // Switch between avatar-01 and avatar-02 without reloading the app
  const handleSelectAvatar = (nextId: QAAvatarId) => {
    if (nextId === selectedAvatarId) return;
    setSelectedAvatarId(nextId);
    setLoadStatus('loading');
    setLoadError(null);
    setInspectedRig(null);
    setEmoteEvent(null);
    const nextEntry = getAvatarCatalogEntry(nextId);
    if (!nextEntry.hasHumanoidSkeleton) {
      setPoseMode('standing');
      setActivity('idle');
    }
  };

  const handleRigInspected = useCallback((caps: RigCapabilities) => {
    setInspectedRig(caps);
    setLoadStatus('loaded');
    setLoadError(null);
  }, []);

  const handleLoadError = useCallback((message: string) => {
    setLoadStatus('error');
    setLoadError(message);
  }, []);

  const setChecklistItem = (itemId: string, status: ChecklistStatus) => {
    setChecklistByAvatar((prev) => {
      const next = {
        ...prev,
        [selectedAvatarId]: {
          ...(prev[selectedAvatarId] || {}),
          [itemId]: status,
        },
      };
      try {
        localStorage.setItem(QA_CHECKLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleResetChecklist = () => {
    setChecklistByAvatar((prev) => {
      const next = { ...prev, [selectedAvatarId]: {} };
      try {
        localStorage.setItem(QA_CHECKLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Capture actual rendered WebGL Canvas to PNG download
  const handleCaptureScreenshot = () => {
    const canvas = canvasDomRef.current;
    if (!canvas) {
      showToast('WebGL canvas is not ready yet. Use Cmd+Shift+4 for a manual screenshot.', 'error');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const avatarPrefix = selectedAvatarId.replace('-', '_');
      const viewSuffix = cameraPreset === 'three_quarter' ? '3quarter' : cameraPreset;
      const filename = `${avatarPrefix}_${viewSuffix}.png`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setCapturedFiles((prev) => (prev.includes(filename) ? prev : [...prev, filename]));
      showToast(`Captured ${filename} from live WebGL canvas`, 'success');
    } catch (err) {
      console.error('[AvatarQA] Canvas capture failed:', err);
      showToast('Canvas capture blocked by browser. Use Cmd+Shift+4 to take a manual screenshot.', 'error');
    }
  };

  // Launch one of the 3 existing Study Room modes directly without duplicating room code
  const handleOpenExistingStudyRoom = (mode: 'isometric' | 'pods' | 'webgl') => {
    try {
      sessionStorage.setItem('ff_dev_room_launch', mode);
    } catch {
      // ignore sessionStorage errors
    }
    setCurrentTab('leaderboard');
  };

  // Strict production guard
  if (!import.meta.env.DEV) {
    return null;
  }

  // Strict Firebase Authentication gate (never bypass auth)
  if (!isAuthenticated || !firebaseUser?.uid) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-[var(--ff-text-primary)]">
          Authenticated Developer Session Required
        </h1>
        <p className="text-xs text-[var(--ff-text-muted)]">
          Avatar Visual QA Mode (<code className="font-mono">#avatar_qa</code>) requires a
          legitimate signed-in Firebase account. Authentication is never bypassed.
        </p>
        <ThemeButton variant="primary" size="sm" onClick={() => void signInWithGoogle()}>
          Sign in with Google
        </ThemeButton>
      </div>
    );
  }

  const isRigged = Boolean(inspectedRig ? inspectedRig.hasHumanoidSkeleton : catalogEntry.hasHumanoidSkeleton);
  const activeChecklist = checklistByAvatar[selectedAvatarId] || {};
  const passCount = VISUAL_QA_CHECKLIST_ITEMS.filter((i) => activeChecklist[i.id] === 'pass').length;
  const fixCount = VISUAL_QA_CHECKLIST_ITEMS.filter((i) => activeChecklist[i.id] === 'needs_fix').length;

  const effectivePose: 'standing' | 'seated' = isRigged ? poseMode : 'standing';
  const effectiveActivity: StudyAvatarActivity = isRigged ? activity : 'idle';
  const animationStatusLabel = isRigged
    ? emoteEvent
      ? `Skeletal Emote: ${emoteEvent.type.toUpperCase()} (${effectivePose})`
      : `Procedural 21-Bone Rig: ${effectivePose.toUpperCase()} · ${effectiveActivity.toUpperCase()}`
    : 'Static Unrigged Mesh: STANDING · Gentle Whole-Model Breathing Only (Skeletal Poses Disabled)';

  return (
    <div className="space-y-6 pb-10">
      {/* QA Mode Header */}
      <div className="p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-amber-500/35 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              DEV ONLY · #avatar_qa
            </span>
            <span className="text-[11px] font-mono text-[var(--ff-text-muted)]">
              Signed in: {firebaseUser.email || firebaseUser.uid}
            </span>
          </div>
          <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
            Interactive 3D Avatar Visual QA &amp; Polish
          </h1>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Inspect live GLB geometry, lighting, rigging, animations, and capture WebGL screenshots for both uploaded characters.
          </p>
        </div>

        {/* Character Selector (No Reload) */}
        <div className="flex flex-wrap items-center gap-2">
          {QA_AVATAR_IDS.map((id) => {
            const entry = getAvatarCatalogEntry(id);
            const active = selectedAvatarId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectAvatar(id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left ${
                  active
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-sm'
                    : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-primary)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/60'
                }`}
              >
                <div>{entry.displayName}</div>
                <div className={`text-[10px] font-mono ${active ? 'text-white/80' : 'text-[var(--ff-text-muted)]'}`}>
                  {entry.id}.glb · {entry.isRigged ? '21-Bone Rig' : 'Unrigged Static'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Model Diagnostics Strip (Live Catalog + Real GLB Inspection) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Character</div>
          <div className="font-bold text-[var(--ff-text-primary)] truncate mt-0.5">{catalogEntry.displayName}</div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Avatar ID</div>
          <div className="font-mono font-bold text-[var(--ff-text-primary)] mt-0.5">{catalogEntry.id}</div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Load Status</div>
          <div
            className={`font-bold mt-0.5 ${
              loadStatus === 'loaded'
                ? 'text-emerald-400'
                : loadStatus === 'error'
                ? 'text-rose-400'
                : 'text-amber-400'
            }`}
          >
            {loadStatus === 'loaded' ? 'Loaded' : loadStatus === 'error' ? 'Error' : 'Loading...'}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Rigging Status</div>
          <div className="font-mono text-[11px] font-semibold text-[var(--ff-text-primary)] truncate mt-0.5">
            {catalogEntry.rigStatus}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Inspected Bones</div>
          <div className="font-mono font-bold text-[var(--ff-text-primary)] mt-0.5">
            {inspectedRig ? `${inspectedRig.boneCount} bones` : 'Inspecting...'}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Animations</div>
          <div className="font-mono text-[11px] font-semibold text-[var(--ff-text-primary)] truncate mt-0.5">
            {catalogEntry.animationSupport}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ff-text-muted)]">Supported Poses</div>
          <div className="font-mono text-[11px] font-semibold text-[var(--ff-text-primary)] mt-0.5">
            {catalogEntry.supportedPoses.join(', ')}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>Model loading error ({catalogEntry.modelUrl}): {loadError}</span>
        </div>
      )}

      {/* Main Split: Large 3D Studio Preview (Left) + Visual Quality Checklist (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols: 3D Preview + Camera & Animation Controls */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl overflow-hidden border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
            {/* Camera & Screenshot Toolbar */}
            <div className="px-4 py-3 border-b border-[var(--ff-border-color)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(CAMERA_PRESETS) as CameraViewPreset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCameraPreset(key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      cameraPreset === key
                        ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                        : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                    }`}
                  >
                    {CAMERA_PRESETS[key].label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setZoomFactor((z) => Math.max(0.65, +(z - 0.15).toFixed(2)))}
                  className="p-1.5 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomFactor((z) => Math.min(1.55, +(z + 0.15).toFixed(2)))}
                  className="p-1.5 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCameraPreset('front');
                    setZoomFactor(1);
                    setResetCounter((c) => c + 1);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Camera</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ff-text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showNameplate}
                    onChange={(e) => setShowNameplate(e.target.checked)}
                    className="rounded accent-[var(--ff-accent)]"
                  />
                  <span>Test Nameplate</span>
                </label>

                <button
                  type="button"
                  onClick={handleCaptureScreenshot}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Capture PNG</span>
                </button>
              </div>
            </div>

            {/* Large Interactive 3D Studio Viewport */}
            <div className="relative h-[440px] sm:h-[520px] w-full bg-gradient-to-b from-[#0b1120] via-[#151e34] to-[#0f172a] touch-none">
              <Canvas
                shadows
                dpr={[1, 1.5]}
                gl={{
                  preserveDrawingBuffer: true,
                  antialias: true,
                  powerPreference: 'high-performance',
                }}
                camera={{ position: [0, 0.28, 3.05], fov: 38 }}
                onCreated={({ gl }) => {
                  canvasDomRef.current = gl.domElement;
                }}
              >
                {/* Studio 3-Point + Facial Fill Lighting */}
                <ambientLight intensity={0.8} />
                <hemisphereLight args={['#e0e7ff', '#1e293b', 0.95]} />
                <directionalLight position={[2.6, 4.2, 3.0]} intensity={1.4} castShadow />
                <directionalLight position={[0, 1.4, 3.4]} intensity={0.55} color="#fff7ed" />
                <directionalLight position={[-2.8, 2.4, -2.5]} intensity={0.6} color="#818cf8" />

                <Suspense fallback={null}>
                  <StudyAvatar
                    key={catalogEntry.id}
                    modelUrl={catalogEntry.modelUrl}
                    name={catalogEntry.displayName}
                    activity={effectiveActivity}
                    poseMode={effectivePose}
                    emoteEvent={isRigged ? emoteEvent : null}
                    position={[0, -0.88, 0]}
                    rotation={[0, 0, 0]}
                    scale={1}
                    nameplateHeight={isRigged ? 1.82 : 2.02}
                    showNameplate={showNameplate}
                    customization={{
                      hairColor: catalogEntry.defaults.hairColor,
                      eyeColor: catalogEntry.defaults.eyeColor,
                      outfitColor: catalogEntry.defaults.outfitColor,
                      accessories: [],
                    }}
                    isLive
                    isSelected
                    subtitle={`${catalogEntry.id} · ${effectivePose}`}
                    onRigInspected={handleRigInspected}
                    onLoadError={handleLoadError}
                  />
                  <ContactShadows position={[0, -0.88, 0]} opacity={0.48} scale={4.5} blur={2.1} far={2.5} />
                </Suspense>

                <QACameraController
                  preset={cameraPreset}
                  zoomFactor={zoomFactor}
                  resetCounter={resetCounter}
                />
              </Canvas>

              {/* Animation Status Indicator Pill */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-slate-200">
                  <Sparkles className={`w-3.5 h-3.5 ${isRigged ? 'text-indigo-400' : 'text-amber-400'}`} />
                  <span>{animationStatusLabel}</span>
                </div>
              </div>
            </div>

            {/* Animation Test Controls Bar */}
            <div className="p-4 border-t border-[var(--ff-border-color)] space-y-3 bg-[var(--ff-surface-muted)]/30">
              {isRigged ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] mr-1">
                      Pose:
                    </span>
                    {(['standing', 'seated'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPoseMode(p);
                          setEmoteEvent(null);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize border transition-colors ${
                          poseMode === p
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] mr-1">
                      Activity:
                    </span>
                    {RIGGED_ACTIVITIES.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => {
                          setActivity(act.id);
                          setEmoteEvent(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          activity === act.id && !emoteEvent
                            ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                            : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                        }`}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] mr-1">
                      Emotes:
                    </span>
                    {RIGGED_EMOTES.map((em) => (
                      <button
                        key={em.id}
                        type="button"
                        onClick={() =>
                          setEmoteEvent({
                            id: `qa_${em.id}_${Date.now()}`,
                            memberId: 'qa',
                            type: em.id,
                            createdAt: Date.now(),
                          })
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
                      >
                        {em.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                      Standing
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold">
                      Gentle Breathing
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-300">
                    Unrigged static mesh (0 bones): skeletal animations are intentionally hidden and never faked.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Part 5: Open the 3 Existing Study Rooms + Screenshot Evidence Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <span>Open Existing Study Room Modes</span>
              </h2>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Launches the real Study Room inside Leaderboard with the dev-only QA status overlay enabled (no duplicate room code).
              </p>
              <div className="flex flex-wrap gap-2">
                <ThemeButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenExistingStudyRoom('isometric')}
                  className="flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Isometric Lounge</span>
                </ThemeButton>
                <ThemeButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenExistingStudyRoom('pods')}
                  className="flex items-center gap-1.5"
                >
                  <LampDesk className="w-3.5 h-3.5" />
                  <span>3D Pods</span>
                </ThemeButton>
                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenExistingStudyRoom('webgl')}
                  className="flex items-center gap-1.5"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>360° Study Room</span>
                </ThemeButton>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5">
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Screenshot Evidence</span>
              </h2>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Use <strong>Capture PNG</strong> above for <code className="font-mono">avatar_01_front.png</code>,{' '}
                <code className="font-mono">avatar_01_side.png</code>,{' '}
                <code className="font-mono">avatar_02_front.png</code>,{' '}
                <code className="font-mono">avatar_02_side.png</code>. For Study Room views (
                <code className="font-mono">isometric_lounge.png</code>,{' '}
                <code className="font-mono">study_pods.png</code>,{' '}
                <code className="font-mono">study_room_360.png</code>), capture directly in your browser (macOS:{' '}
                <kbd className="px-1 py-0.5 rounded bg-[var(--ff-surface-muted)] font-mono">Cmd+Shift+4</kbd>).
              </p>
              {capturedFiles.length > 0 && (
                <div className="text-[11px] text-emerald-400 font-mono">
                  Downloaded this session: {capturedFiles.join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Part 6: Manual 3-Account Authenticated Multiplayer Workflow */}
          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Authenticated 3-Account Multiplayer Test Workflow</span>
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Manual Verification Pending
              </span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-[var(--ff-text-secondary)]">
              <li>Open 3 separate browser profiles signed into 3 legitimate Google accounts and join the same Study Squad.</li>
              <li><strong>User A</strong> selects <code className="font-mono">avatar-01</code>, <strong>User B</strong> selects <code className="font-mono">avatar-02</code>, and <strong>User C</strong> selects a third catalog avatar (or leaves default fallback) in Avatar Studio and saves.</li>
              <li>Confirm each user sees their own avatar and the other two members&apos; exact avatars across <strong>Isometric Lounge</strong>, <strong>3D Pods</strong>, and <strong>360° Study Room</strong>.</li>
              <li>Change User A&apos;s outfit color or activity (e.g. Typing / Wave) and confirm Users B &amp; C remain completely independent.</li>
            </ol>
          </div>
        </div>

        {/* Right 4 Cols: 12-Item Visual Quality Checklist */}
        <div className="lg:col-span-4 p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--ff-border-color)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <span>Visual Quality Checklist</span>
              </h2>
              <p className="text-[11px] text-[var(--ff-text-muted)] font-mono mt-0.5">
                {selectedAvatarId} · {passCount} Pass · {fixCount} Needs Fix ·{' '}
                {VISUAL_QA_CHECKLIST_ITEMS.length - passCount - fixCount} Pending
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetChecklist}
              className="text-[11px] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] underline"
            >
              Reset
            </button>
          </div>

          <div className="space-y-2">
            {VISUAL_QA_CHECKLIST_ITEMS.map((item) => {
              const status: ChecklistStatus = activeChecklist[item.id] || 'pending';
              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                    status === 'pass'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : status === 'needs_fix'
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-[var(--ff-surface-muted)]/50 border-[var(--ff-border-color)]'
                  }`}
                >
                  <span className="font-medium text-[var(--ff-text-primary)]">{item.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setChecklistItem(item.id, status === 'pass' ? 'pending' : 'pass')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors ${
                        status === 'pass'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] hover:text-emerald-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Pass</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setChecklistItem(item.id, status === 'needs_fix' ? 'pending' : 'needs_fix')
                      }
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors ${
                        status === 'needs_fix'
                          ? 'bg-rose-600 text-white'
                          : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] hover:text-rose-400'
                      }`}
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Fix</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarQAView;
