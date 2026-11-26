/**
 * FocusFlow & Finance — 360° Interactive WebGL 3D Study Room (Phase 4)
 *
 * Lazy-loaded only when the user selects the "360° 3D Room" view inside a Study Squad.
 * Integrates:
 * - RoomCameraRig (Isometric, Free, Cinematic, and Character Focus Camera)
 * - RoomLightingController (Morning, Afternoon, Sunset, Night, Auto Day/Night)
 * - RoomWeatherEffects (Clear, Rain, Snow outside windows + Ambient sunlight particles)
 * - StudyRoomEnvironment (6 real 3D themes, 4 desk styles, 3 chair styles, plants & decor toggles)
 * - StudyAvatar (rigged & animated GLB anime characters with one-time emotes)
 * - RoomCustomizationPanel (live interactive customization overlay)
 */

import React, { Component, Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Camera, Crosshair, Palette, RotateCcw, Sparkles } from 'lucide-react';
import type { RankedLeaderboardEntry } from '../../types/leaderboard.ts';
import StudyAvatar, { preloadStudyAvatarModels } from '../study-room/StudyAvatar.tsx';
import StudyRoomEnvironment, { DESK_SLOTS } from '../study-room/StudyRoomEnvironment.tsx';
import RoomCameraRig, { type RoomCameraMode } from '../study-room/RoomCameraRig.tsx';
import RoomLightingController from '../study-room/RoomLightingController.tsx';
import RoomWeatherEffects from '../study-room/RoomWeatherEffects.tsx';
import RoomCustomizationPanel from '../study-room/RoomCustomizationPanel.tsx';
import { deriveStudyActivity, resolveStudyAvatarIdentity } from '../../lib/studyAvatarRegistry.ts';
import { getAvatarCatalogEntry } from '../../features/avatar/avatar-catalog.ts';
import { ACTIVITY_META } from '../../features/study-room/types.ts';
import {
  defaultRoomCustomization,
  ROOM_THEME_PALETTES,
  type RoomCustomization,
} from '../../features/study-room/customization-types.ts';
import '../study-room/StudyRoom.css';

interface SquadWebGLRoomProps {
  entries: RankedLeaderboardEntry[];
  selectedUid: string | null;
  onSelectMember: (uid: string) => void;
  ambiance: 'night' | 'dusk';
  customization?: RoomCustomization;
  onUpdateCustomization?: (next: RoomCustomization) => void;
}

class WebGLErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface StudyRoomSceneProps {
  entries: RankedLeaderboardEntry[];
  selectedUid: string | null;
  onSelectMember: (uid: string) => void;
  customization: RoomCustomization;
  cameraMode: RoomCameraMode;
  focusTarget: [number, number, number] | null;
  autoOrbit: boolean;
  resetCounter: number;
  onUserDrag: () => void;
}

const StudyRoomScene: React.FC<StudyRoomSceneProps> = ({
  entries,
  selectedUid,
  onSelectMember,
  customization,
  cameraMode,
  focusTarget,
  autoOrbit,
  resetCounter,
  onUserDrag,
}) => {
  const palette = ROOM_THEME_PALETTES[customization.theme] || ROOM_THEME_PALETTES.cozy;
  const visibleEntries = useMemo(
    () => entries.filter((e) => e.isStudyingLive).slice(0, DESK_SLOTS.length),
    [entries]
  );

  return (
    <>
      <color attach="background" args={[palette.bgHex]} />
      <fog attach="fog" args={[palette.bgHex, 16, 34]} />

      {/* Dynamic Day / Night / Sunset / Morning / Auto Lighting */}
      <RoomLightingController
        mode={customization.lighting}
        accentColor={palette.accentStripColor}
      />

      {/* Single CameraControls Rig (Isometric / Free / Cinematic / Character Focus) */}
      <RoomCameraRig
        mode={cameraMode}
        focusTarget={focusTarget}
        autoOrbit={autoOrbit}
        resetCounter={resetCounter}
        onCameraMove={onUserDrag}
      />

      {/* Window Rain / Snow & Indoor Ambient Dust Effects */}
      <RoomWeatherEffects
        weather={customization.weather}
        ambientEffects={customization.ambientEffects}
      />

      {/* Premium Customizable Study Room Architecture & Furniture */}
      <StudyRoomEnvironment
        entries={entries}
        selectedUid={selectedUid}
        onSelectMember={onSelectMember}
        customization={customization}
      />

      {/* Seated Anime 3D Avatars aligned to DESK_SLOTS */}
      <Suspense fallback={null}>
        {DESK_SLOTS.map((slot, idx) => {
          const entry = visibleEntries[idx];
          if (!entry) return null;
          const identity = resolveStudyAvatarIdentity(entry);
          const catalogEntry = getAvatarCatalogEntry(identity.id);
          const canSit = catalogEntry.hasHumanoidSkeleton && catalogEntry.supportedPoses.includes('seated');
          const activity = deriveStudyActivity(entry);
          const isLive = Boolean(entry.isStudyingLive);
          const isSelected = selectedUid === entry.uid;
          const activityBadge = ACTIVITY_META[activity]?.badgeText || '📚 Studying';
          const subtitle = isLive
            ? `${activityBadge} • ${entry.activeSubject || 'Deep Focus'} • ${
                entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'
              }`
            : activity === 'break'
            ? `${activityBadge} • #${entry.rank}`
            : `#${entry.rank} • ${entry.hoursFormatted} • ${entry.streakDays}d`;

          // Rigged avatars sit on the chair at z=0.56; unrigged static models (e.g. avatar-02)
          // stand behind the chair backrest at z=1.12 to prevent chair clipping and nameplate face overlap.
          const avatarPosition: [number, number, number] = canSit ? [0, 0, 0.56] : [0, 0, 1.12];
          const avatarNameplateHeight = canSit ? 1.65 : 2.02;

          return (
            <group key={`${entry.uid}-${idx}`} position={[slot.x, 0, slot.z]} rotation={[0, slot.rotY, 0]}>
              <StudyAvatar
                modelUrl={identity.modelUrl}
                name={entry.displayName}
                activity={activity}
                position={avatarPosition}
                rotation={[0, Math.PI, 0]}
                scale={1}
                modelPosition={[0, -0.02, 0]}
                nameplateHeight={avatarNameplateHeight}
                poseMode={canSit ? 'seated' : 'standing'}
                customization={identity.customization}
                isLive={isLive}
                isSelected={isSelected}
                subtitle={subtitle}
                emoteEvent={entry.lastEmote ?? null}
                onSelect={() => onSelectMember(entry.uid)}
              />
            </group>
          );
        })}
      </Suspense>
    </>
  );
};

export const SquadWebGLRoom: React.FC<SquadWebGLRoomProps> = ({
  entries,
  selectedUid,
  onSelectMember,
  ambiance,
  customization: externalCustomization,
  onUpdateCustomization,
}) => {
  const [localCustomization, setLocalCustomization] = useState<RoomCustomization>(() => ({
    ...defaultRoomCustomization,
    lighting: ambiance === 'night' ? 'night' : 'afternoon',
  }));
  const customization = externalCustomization ?? localCustomization;

  const handleCustomizationChange = (next: RoomCustomization) => {
    setLocalCustomization(next);
    onUpdateCustomization?.(next);
  };

  const [cameraMode, setCameraMode] = useState<RoomCameraMode>('free');
  const [isFocusingSelected, setIsFocusingSelected] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const [webglSupported] = useState(() => {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  });

  const liveCount = useMemo(() => entries.filter((e) => e.isStudyingLive).length, [entries]);

  const focusTarget = useMemo<[number, number, number] | null>(() => {
    if (!isFocusingSelected || !selectedUid) return null;
    const idx = entries.slice(0, DESK_SLOTS.length).findIndex((e) => e.uid === selectedUid);
    if (idx < 0) return null;
    const slot = DESK_SLOTS[idx];
    return [slot.x, 0, slot.z];
  }, [isFocusingSelected, selectedUid, entries]);

  // Lazy-preload only the GLBs needed by current room members
  useEffect(() => {
    const urls = entries.slice(0, DESK_SLOTS.length).map((e) => resolveStudyAvatarIdentity(e).modelUrl);
    preloadStudyAvatarModels(urls);
  }, [entries]);

  const handleSelectMemberFrom3D = (uid: string) => {
    onSelectMember(uid);
    setIsFocusingSelected(true);
    setAutoOrbit(false);
  };

  const handleResetView = () => {
    setIsFocusingSelected(false);
    setResetCounter((c) => c + 1);
  };

  const fallbackUI = (
    <div className="p-8 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-center text-xs text-[var(--ff-text-muted)]">
      3D WebGL is unavailable on this device/browser. Switch to <strong>Isometric Lounge</strong> or{' '}
      <strong>3D Pods</strong> above.
    </div>
  );

  if (!webglSupported) {
    return fallbackUI;
  }

  return (
    <WebGLErrorBoundary fallback={fallbackUI}>
      <div className="study-room-shell">
        <div className="study-room-canvas cursor-grab active:cursor-grabbing">
          <Canvas
            shadows
            dpr={[1, 1.5]}
            gl={{ powerPreference: 'high-performance', antialias: true }}
            camera={{ position: [0, 5.4, 9.2], fov: 45, near: 0.1, far: 65 }}
            style={{ width: '100%', height: '100%', touchAction: 'none' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                'webglcontextlost',
                (event) => {
                  event.preventDefault();
                },
                false
              );
            }}
          >
            <StudyRoomScene
              entries={entries}
              selectedUid={selectedUid}
              onSelectMember={handleSelectMemberFrom3D}
              customization={customization}
              cameraMode={cameraMode}
              focusTarget={focusTarget}
              autoOrbit={autoOrbit}
              resetCounter={resetCounter}
              onUserDrag={() => setAutoOrbit(false)}
            />
          </Canvas>
        </div>

        {/* Floating HUD Status */}
        <div className="study-room-hud">
          <div className="study-room-status">
            <span className={`study-room-status-dot ${liveCount > 0 ? 'study-room-status-dot--live' : ''}`} />
            <span>
              {liveCount > 0 ? `${liveCount} Studying Live` : 'Study Lounge Ready'} •{' '}
              {ROOM_THEME_PALETTES[customization.theme]?.label || 'Cozy Anime'}
            </span>
          </div>
        </div>

        {/* Top-Right Room Customizer Drawer */}
        {customizerOpen && (
          <div className="absolute top-3 right-3 bottom-16 z-10 flex items-start justify-end pointer-events-auto">
            <RoomCustomizationPanel
              value={customization}
              onChange={handleCustomizationChange}
              onClose={() => setCustomizerOpen(false)}
            />
          </div>
        )}

        {/* Interactive Camera & Customization Controls */}
        <div className="study-room-controls">
          {(['isometric', 'free', 'cinematic'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setIsFocusingSelected(false);
                setCameraMode(m);
              }}
              className={`study-room-control ${cameraMode === m && !isFocusingSelected ? 'study-room-control--active' : ''}`}
              title={`Switch to ${m} camera`}
            >
              <Camera className="w-3.5 h-3.5 text-indigo-300" />
              <span className="capitalize">{m}</span>
            </button>
          ))}

          {selectedUid && (
            <button
              type="button"
              onClick={() => setIsFocusingSelected((prev) => !prev)}
              className={`study-room-control ${isFocusingSelected ? 'study-room-control--active' : ''}`}
              title={isFocusingSelected ? 'Return to full room view' : 'Focus camera on selected character'}
            >
              <Crosshair className="w-3.5 h-3.5 text-sky-300" />
              <span>{isFocusingSelected ? 'Full Room' : 'Focus Desk'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAutoOrbit((v) => !v)}
            className={`study-room-control ${autoOrbit ? 'study-room-control--active' : ''}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{autoOrbit ? 'Orbiting' : 'Orbit'}</span>
          </button>

          <button
            type="button"
            onClick={handleResetView}
            className="study-room-control"
            title="Reset camera angle"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setCustomizerOpen((v) => !v)}
            className={`study-room-control ${customizerOpen ? 'study-room-control--active' : ''}`}
            title="Customize 3D room theme, lighting, weather & furniture"
          >
            <Palette className="w-3.5 h-3.5 text-pink-300" />
            <span>Customize</span>
          </button>
        </div>
      </div>
    </WebGLErrorBoundary>
  );
};

export default SquadWebGLRoom;
