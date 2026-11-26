/**
 * FocusFlow & Finance — Squad Virtual Study Room (3 Visual Modes)
 *
 * Supports all 3 interactive spatial study room styles with a clean mode switcher:
 * 1. Isometric Lo-Fi Lounge (Crisp SVG + CSS 3D isometric library — instant, zero extra bundle)
 * 2. 3D Study Pods (Mouse-reactive CSS perspective tilt pods — sleek Bento & mobile-first)
 * 3. 360° WebGL Room (Lazy-loaded Three.js rotatable 3D room — downloads only when opened)
 *
 * 100% deterministic, zero-AI, zero finance exposure, powered by real-time Firestore squad presence.
 */

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flame,
  LampDesk,
  Layers,
  Moon,
  Radio,
  Sun,
  Timer,
  Users,
  Copy,
  Check,
  Sparkles,
  Crown,
} from 'lucide-react';
import type { RankedLeaderboardEntry, StudySquad } from '../../types/leaderboard.ts';
import { useApp } from '../../context/AppContext.tsx';
import { ThemeButton } from '../ui/ThemePrimitives.tsx';
import { AnimeCharacterSvg } from '../study-room/AnimeCharacterSvg.tsx';
import StudyActivityBar from '../study-room/StudyActivityBar.tsx';
import { deriveStudyActivity, resolveStudyAvatarIdentity } from '../../lib/studyAvatarRegistry.ts';
import { getAvatarCatalogEntry } from '../../features/avatar/avatar-catalog.ts';
import { ACTIVITY_META, EMOTE_META, type AvatarEmote, type StudyActivity } from '../../features/study-room/types.ts';
import {
  defaultRoomCustomization,
  sanitizeRoomCustomization,
  type RoomCustomization,
} from '../../features/study-room/customization-types.ts';
import { triggerStudyRoomEmote, updateStudyRoomActivity } from '../../lib/leaderboardService.ts';

const LazySquadWebGLRoom = lazy(() => import('./SquadWebGLRoom.tsx'));

export type StudyRoomStyle = 'isometric' | 'pods' | 'webgl';

interface SquadStudyRoomProps {
  squad: StudySquad | null;
  entries: RankedLeaderboardEntry[];
  periodLabel: string;
  initialRoomStyle?: StudyRoomStyle;
  onCopyInvite?: (code: string) => void;
  copiedCode?: string | null;
  onStartFocus?: () => void;
}

const ISO_SEAT_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 220, y: 205 },
  { x: 375, y: 145 },
  { x: 530, y: 205 },
  { x: 685, y: 265 },
  { x: 220, y: 340 },
  { x: 375, y: 280 },
  { x: 530, y: 340 },
  { x: 685, y: 400 },
];

/** Mode 2: Interactive 3D-tilting Spatial Study Pod Card */
const SpatialStudyPodCard: React.FC<{
  entry: RankedLeaderboardEntry;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ entry, isSelected, onSelect }) => {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -py * 11, ry: px * 11 });
  };

  const handleMouseLeave = () => setTilt({ rx: 0, ry: 0 });

  return (
    <div style={{ perspective: '900px' }}>
      <button
        type="button"
        onClick={onSelect}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(${isSelected ? 8 : 0}px)`,
          transformStyle: 'preserve-3d',
        }}
        className={`w-full text-left relative rounded-2xl p-4 border transition-all duration-200 overflow-hidden ${
          entry.isStudyingLive
            ? 'bg-gradient-to-br from-[var(--ff-surface-card)] via-[var(--ff-surface-card)] to-amber-500/10 border-amber-500/45 shadow-lg shadow-amber-500/10'
            : 'bg-[var(--ff-surface-card)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/50'
        } ${isSelected ? 'ring-2 ring-[var(--ff-accent)]' : ''}`}
      >
        {/* Warm Desk Lamp Glow Beam for Live Studiers */}
        {entry.isStudyingLive && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-400/20 blur-2xl"
          />
        )}

        {/* Top Row: Rank + Lamp Indicator */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold border ${
              entry.rank === 1
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)]'
            }`}
          >
            {entry.rank === 1 && <Crown className="w-3 h-3" />}
            #{entry.rank}
          </span>

          <div className="flex items-center gap-1.5">
            {entry.isStudyingLive ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--ff-text-muted)]">
                <LampDesk className="w-3 h-3 opacity-50" />
                Idle
              </span>
            )}
          </div>
        </div>

        {/* Mini 3D Pod Desk + Seated Anime Avatar Stage */}
        <div
          className={`relative rounded-xl p-3 mb-3 border flex items-center gap-3 overflow-hidden ${
            entry.isStudyingLive
              ? 'bg-gradient-to-r from-slate-950/90 via-indigo-950/60 to-slate-950/90 border-sky-400/35 shadow-inner'
              : 'bg-[var(--ff-surface-muted)]/60 border-[var(--ff-border-color)]/70'
          }`}
        >
          {/* Pod Desk Lamp Strip */}
          <div
            aria-hidden="true"
            className={`absolute bottom-0 inset-x-0 h-1 ${
              entry.isStudyingLive ? 'bg-gradient-to-r from-amber-400/60 via-sky-400/60 to-indigo-400/60' : 'bg-slate-700/30'
            }`}
          />
          <div className="relative shrink-0">
            <AnimeCharacterSvg
              identity={resolveStudyAvatarIdentity(entry)}
              isLive={entry.isStudyingLive}
              activity={deriveStudyActivity(entry)}
              variant="bust"
              className="w-11 h-11 rounded-xl shadow-md"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                {entry.displayName}
              </span>
              {entry.isCurrentUser && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ff-accent)]/20 text-[var(--ff-accent-text)]">
                  You
                </span>
              )}
            </div>
            <div className="text-[11px] truncate mt-0.5 font-mono">
              {entry.isStudyingLive ? (
                <span className="text-sky-300">
                  {deriveStudyActivity(entry).toUpperCase()} · {entry.activeSubject || 'Deep Focus'} ·{' '}
                  {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
                </span>
              ) : (
                <span className="text-[var(--ff-text-muted)]">Pod resting · Desk ready</span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Stats Bar */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-400">
              <Flame className="w-3.5 h-3.5" />
              {entry.streakDays}d
            </span>
            <span className="text-[11px] font-mono text-[var(--ff-text-muted)]">
              Goal {entry.goalProgressPct}%
            </span>
          </div>
          <span className="font-mono font-extrabold text-sm text-[var(--ff-text-primary)]">
            {entry.hoursFormatted}
          </span>
        </div>
      </button>
    </div>
  );
};

export const SquadStudyRoom: React.FC<SquadStudyRoomProps> = ({
  squad,
  entries,
  periodLabel,
  initialRoomStyle,
  onCopyInvite,
  copiedCode,
  onStartFocus,
}) => {
  const { user, firebaseUser, settings, updateSettings, setCurrentTab, isRunning, timerMode, activeSessionId } = useApp();
  const activeUid = firebaseUser?.uid || user?.id || 'usr_guest';
  const roomStorageKey = `ff_study_room_customization_${activeUid}`;
  const [roomStyle, setRoomStyle] = useState<StudyRoomStyle>(() => initialRoomStyle || 'isometric');
  const readLocalCustomization = (storageKey: string): RoomCustomization => {
    if (settings?.studyRoomCustomization) {
      return sanitizeRoomCustomization(settings.studyRoomCustomization);
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return sanitizeRoomCustomization(JSON.parse(saved));
    } catch {
      // ignore storage read errors
    }
    const hr = new Date().getHours();
    return {
      ...defaultRoomCustomization,
      lighting: hr >= 6 && hr < 18 ? 'afternoon' : 'night',
    };
  };
  const [localCustomization, setLocalCustomization] = useState<RoomCustomization>(() =>
    readLocalCustomization(roomStorageKey)
  );

  useEffect(() => {
    setLocalCustomization(readLocalCustomization(roomStorageKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomStorageKey, settings?.studyRoomCustomization]);

  const handleUpdateCustomization = (next: RoomCustomization) => {
    const clean = sanitizeRoomCustomization(next);
    setLocalCustomization(clean);
    try {
      localStorage.setItem(roomStorageKey, JSON.stringify(clean));
    } catch {
      // ignore storage write errors
    }
    void updateSettings({ studyRoomCustomization: clean }, { silent: true }).catch(() => {});
  };

  const ambiance: 'night' | 'dusk' =
    localCustomization.lighting === 'night' ||
    localCustomization.theme === 'midnight' ||
    localCustomization.theme === 'neon'
      ? 'night'
      : 'dusk';

  const setAmbiance = (updater: (prev: 'night' | 'dusk') => 'night' | 'dusk') => {
    const nextAmb = updater(ambiance);
    handleUpdateCustomization({
      ...localCustomization,
      lighting: nextAmb === 'night' ? 'night' : 'sunset',
    });
  };
  const [selectedUid, setSelectedUid] = useState<string | null>(
    () => entries.find((e) => e.isStudyingLive)?.uid || entries[0]?.uid || null
  );

  const currentUserEntry = useMemo(
    () => entries.find((e) => e.isCurrentUser) || null,
    [entries]
  );

  // Optimistic local activity state for instant responsiveness + Firestore sync
  const [optimisticActivity, setOptimisticActivity] = useState<StudyActivity | null>(null);
  const [optimisticEmote, setOptimisticEmote] = useState<{
    id: string;
    memberId: string;
    type: AvatarEmote;
    createdAt: number;
  } | null>(null);

  const effectiveEntries = useMemo(() => {
    const isOnShortPauseOrBreak =
      (!isRunning && Boolean(activeSessionId)) ||
      timerMode === 'short_break' ||
      timerMode === 'long_break';
    const isSelfFocusActive = Boolean(isRunning && timerMode === 'work');
    return entries.map((e) => {
      if (!e.isCurrentUser) return e;
      return {
        ...e,
        isStudyingLive: isOnShortPauseOrBreak ? false : e.isStudyingLive || isSelfFocusActive,
        studyActivity: isOnShortPauseOrBreak
          ? 'break'
          : optimisticActivity ?? e.studyActivity,
        lastEmote:
          optimisticEmote && (!e.lastEmote || optimisticEmote.createdAt >= e.lastEmote.createdAt)
            ? optimisticEmote
            : e.lastEmote,
      };
    });
  }, [entries, optimisticActivity, optimisticEmote, isRunning, timerMode, activeSessionId]);

  const roomSeatedEntries = useMemo(
    () =>
      [...effectiveEntries].sort(
        (a, b) => Number(Boolean(b.isStudyingLive)) - Number(Boolean(a.isStudyingLive))
      ),
    [effectiveEntries]
  );

  const currentActivity: StudyActivity = useMemo(() => {
    if (optimisticActivity) return optimisticActivity;
    if (currentUserEntry) return deriveStudyActivity(currentUserEntry);
    return 'idle';
  }, [optimisticActivity, currentUserEntry]);

  const handleActivityChange = async (nextActivity: StudyActivity) => {
    setOptimisticActivity(nextActivity);
    if (currentUserEntry?.uid) {
      await updateStudyRoomActivity({ uid: currentUserEntry.uid, activity: nextActivity });
    }
  };

  const handleTriggerEmote = async (type: AvatarEmote) => {
    if (!currentUserEntry?.uid) return;
    const nowMs = Date.now();
    setOptimisticEmote({
      id: `local_${nowMs.toString(36)}`,
      memberId: currentUserEntry.uid,
      type,
      createdAt: nowMs,
    });
    await triggerStudyRoomEmote({ uid: currentUserEntry.uid, type });
  };

  const selectedEntry = useMemo(
    () => effectiveEntries.find((e) => e.uid === selectedUid) || effectiveEntries[0] || null,
    [effectiveEntries, selectedUid]
  );

  const liveCount = useMemo(
    () => effectiveEntries.filter((e) => e.isStudyingLive).length,
    [effectiveEntries]
  );

  const isNight = ambiance === 'night';

  return (
    <div className="space-y-4">
      {/* Multiplayer Activity Bar for Current User */}
      {currentUserEntry && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <StudyActivityBar
            value={currentActivity}
            onChange={(act) => void handleActivityChange(act)}
          />
          <div className="flex items-center gap-1.5 shrink-0">
            {(['wave', 'clap', 'celebrate'] as const).map((emoteKey) => (
              <button
                key={emoteKey}
                type="button"
                onClick={() => void handleTriggerEmote(emoteKey)}
                className="px-2.5 py-2 rounded-xl text-[11px] font-semibold bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/60 hover:bg-[var(--ff-surface-hover)] transition-all flex items-center gap-1"
                title={`Send ${EMOTE_META[emoteKey].label} reaction`}
              >
                <span>{EMOTE_META[emoteKey].icon}</span>
                <span>{EMOTE_META[emoteKey].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Room Top Bar: Style Switcher + Ambiance + Live Count */}
      <div className="p-3.5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400">
            <LampDesk className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                {squad ? `${squad.name} — Virtual Study Room` : 'Global Study Lounge'}
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Radio className={`w-3 h-3 ${liveCount > 0 ? 'animate-pulse text-red-400' : ''}`} />
                {liveCount} Live / {entries.length} Desks
              </span>
            </div>
            <p className="text-[11px] text-[var(--ff-text-muted)]">
              Glowing desk lamps show squadmates actively running a Pomodoro session right now.
            </p>
          </div>
        </div>

        {/* 3-Mode Style Switcher + Day/Night Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)]">
            {(
              [
                { id: 'isometric', label: 'Isometric Lounge', icon: Layers },
                { id: 'pods', label: '3D Pods', icon: LampDesk },
                { id: 'webgl', label: '360° 3D Room', icon: Box },
              ] as const
            ).map((mode) => {
              const Icon = mode.icon;
              const active = roomStyle === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setRoomStyle(mode.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setCurrentTab('avatar_studio')}
            className="px-2.5 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
            title="Customize your 3D Study Avatar"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Customize Avatar</span>
          </button>

          <button
            type="button"
            onClick={() => setAmbiance((a) => (a === 'night' ? 'dusk' : 'night'))}
            className="p-2 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
            title={isNight ? 'Switch to Warm Dusk Ambiance' : 'Switch to Night Lo-Fi Ambiance'}
          >
            {isNight ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
          </button>
        </div>
      </div>

      {/* Dev-Only Study Room Avatar QA Status Overlay (excluded from production builds) */}
      {import.meta.env.DEV && (() => {
        const targetEntry = currentUserEntry || selectedEntry;
        const identity = targetEntry ? resolveStudyAvatarIdentity(targetEntry) : null;
        const cat = identity ? getAvatarCatalogEntry(identity.id) : null;
        const canSit = Boolean(cat && cat.hasHumanoidSkeleton && cat.supportedPoses.includes('seated'));
        const charPos = roomStyle === 'webgl' ? (canSit ? '[0, 0, 0.56]' : '[0, 0, 1.12]') : '2D Layout';
        const nameplatePos = roomStyle === 'webgl' ? (canSit ? 'y = 1.65' : 'y = 2.02') : 'Inline Pill';
        return (
          <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-amber-400">DEV QA</span>
              <span>Mode: <strong>{roomStyle}</strong></span>
              <span>Avatar: <strong>{identity?.id || 'none'}</strong></span>
              <span>Model: <strong>{identity ? 'Ready' : 'None'}</strong></span>
              <span>Rig: <strong>{cat ? (cat.hasHumanoidSkeleton ? '21-Bone Rig' : 'Unrigged Static') : 'n/a'}</strong></span>
              <span>Pose: <strong>{canSit ? 'seated' : 'standing'}</strong></span>
              <span>Pos: <strong>{charPos}</strong></span>
              <span>Nameplate: <strong>{nameplatePos}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('avatar_qa')}
              className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold transition-colors"
            >
              Back to #avatar_qa
            </button>
          </div>
        );
      })()}

      {/* MODE 1: ISOMETRIC LO-FI STUDY LOUNGE (Crisp SVG 2.5D Room) */}
      {roomStyle === 'isometric' && (
        <div
          className={`relative rounded-2xl border border-[var(--ff-border-color)] overflow-hidden ${
            isNight
              ? 'bg-gradient-to-b from-[#0b1120] via-[#111827] to-[#0f172a]'
              : 'bg-gradient-to-b from-[#1e1b2e] via-[#251f33] to-[#1a1625]'
          }`}
        >
          <svg
            viewBox="0 0 900 490"
            className="w-full h-auto block select-none"
            role="img"
            aria-label="Isometric Virtual Study Room"
          >
            <defs>
              <linearGradient id="iso-wall-left" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={isNight ? '#162038' : '#2a223b'} />
                <stop offset="100%" stopColor={isNight ? '#0f172a' : '#1d182a'} />
              </linearGradient>
              <linearGradient id="iso-wall-right" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={isNight ? '#1e293b' : '#322642'} />
                <stop offset="100%" stopColor={isNight ? '#111827' : '#211a2e'} />
              </linearGradient>
              <linearGradient id="iso-floor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isNight ? '#1e293b' : '#2e2438'} />
                <stop offset="100%" stopColor={isNight ? '#0f172a' : '#1b1524'} />
              </linearGradient>
              <radialGradient id="lamp-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="window-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isNight ? '#0f172a' : '#7c2d12'} />
                <stop offset="100%" stopColor={isNight ? '#1d4ed8' : '#f59e0b'} />
              </linearGradient>
            </defs>

            {/* Isometric Room Shell: Back-Left Wall, Back-Right Wall, Diamond Floor */}
            <polygon points="450,36 80,185 80,295 450,150" fill="url(#iso-wall-left)" stroke="#334155" strokeWidth="1" />
            <polygon points="450,36 820,185 820,295 450,150" fill="url(#iso-wall-right)" stroke="#334155" strokeWidth="1" />
            <polygon points="450,150 820,295 450,455 80,295" fill="url(#iso-floor)" stroke="#334155" strokeWidth="1.2" />

            {/* Cozy Rug in Center */}
            <polygon
              points="450,188 730,298 450,418 170,298"
              fill={isNight ? '#172554' : '#3b1f3a'}
              fillOpacity="0.32"
              stroke={isNight ? '#3b82f6' : '#f59e0b'}
              strokeOpacity="0.22"
              strokeWidth="1.5"
            />

            {/* Left-Wall Ambient Window with Curtains & Moon/Stars */}
            <polygon points="210,138 355,80 355,148 210,206" fill="url(#window-sky)" stroke="#475569" strokeWidth="3" />
            <polygon points="196,144 214,136 214,208 196,216" fill={isNight ? '#4338ca' : '#9a3412'} opacity="0.88" />
            <polygon points="351,81 369,74 369,146 351,153" fill={isNight ? '#4338ca' : '#9a3412'} opacity="0.88" />
            <line x1="282" y1="109" x2="282" y2="177" stroke="#475569" strokeWidth="2" />
            <line x1="210" y1="172" x2="355" y2="114" stroke="#475569" strokeWidth="2" />
            <circle cx="318" cy="116" r="11" fill="#fef08a" opacity="0.9" />
            {isNight && (
              <>
                <circle cx="242" cy="152" r="1.8" fill="#e2e8f0" />
                <circle cx="264" cy="132" r="1.4" fill="#e2e8f0" />
                <circle cx="295" cy="138" r="1.5" fill="#cbd5e1" />
              </>
            )}

            {/* Stylish Wall Clock & Framed Poster */}
            <circle cx="450" cy="96" r="16" fill="#f8fafc" stroke="#334155" strokeWidth="3" />
            <line x1="450" y1="96" x2="450" y2="85" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
            <line x1="450" y1="96" x2="458" y2="99" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />

            {/* Right-Wall Bookshelf */}
            <polygon points="560,86 710,146 710,214 560,154" fill="#2c2220" stroke="#475569" strokeWidth="1.5" />
            <line x1="560" y1="120" x2="710" y2="180" stroke="#57433f" strokeWidth="2" />
            <polygon points="576,99 588,104 588,128 576,123" fill="#6366f1" />
            <polygon points="592,106 604,111 604,135 592,130" fill="#10b981" />
            <polygon points="608,113 620,118 620,142 608,137" fill="#f59e0b" />
            <polygon points="638,125 650,130 650,154 638,149" fill="#ec4899" />
            <polygon points="656,133 668,138 668,162 656,157" fill="#38bdf8" />

            {/* Decorative Corner Indoor Plants */}
            {[
              { x: 115, y: 280 },
              { x: 785, y: 280 },
              { x: 450, y: 422 },
            ].map((plant, pIdx) => (
              <g key={`iso-plant-${pIdx}`} transform={`translate(${plant.x}, ${plant.y})`}>
                <ellipse cx="0" cy="6" rx="11" ry="5" fill="#7c4a3a" />
                <rect x="-8" y="-6" width="16" height="12" rx="3" fill="#a16f63" />
                <ellipse cx="-6" cy="-12" rx="6" ry="9" transform="rotate(-24 -6 -12)" fill="#70a77f" />
                <ellipse cx="6" cy="-12" rx="6" ry="9" transform="rotate(24 6 -12)" fill="#5b926a" />
                <ellipse cx="0" cy="-15" rx="5" ry="10" fill="#86efac" opacity="0.85" />
              </g>
            ))}

            {/* Render up to 8 Isometric Desks (Online/Live at front desks, Offline/Idle at remaining desks) */}
            {ISO_SEAT_POSITIONS.map((pos, idx) => {
              const entry = roomSeatedEntries[idx] || null;
              const isLive = Boolean(entry?.isStudyingLive);
              const isSelected = Boolean(entry && selectedEntry?.uid === entry.uid);

              return (
                <g
                  key={`iso-desk-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => entry && setSelectedUid(entry.uid)}
                  className={entry ? 'cursor-pointer' : 'opacity-45'}
                >
                  {/* Warm Lamp Pool on Desk (bright for Live, subtle dim pool for Offline/Idle) */}
                  {isLive ? (
                    <ellipse cx="0" cy="-12" rx="68" ry="38" fill="url(#lamp-glow)" />
                  ) : entry ? (
                    <ellipse cx="0" cy="-12" rx="44" ry="24" fill="url(#lamp-glow)" opacity="0.22" />
                  ) : null}

                  {/* Selection Highlight Ring */}
                  {isSelected && (
                    <ellipse
                      cx="0"
                      cy="12"
                      rx="58"
                      ry="28"
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="2.2"
                      strokeDasharray="5 4"
                    />
                  )}

                  {/* Desk Legs */}
                  <line x1="-38" y1="6" x2="-38" y2="30" stroke="#334155" strokeWidth="3" />
                  <line x1="38" y1="6" x2="38" y2="30" stroke="#334155" strokeWidth="3" />
                  <line x1="0" y1="22" x2="0" y2="44" stroke="#1e293b" strokeWidth="3" />

                  {/* Isometric Desk Top */}
                  <polygon
                    points="0,-14 48,6 0,26 -48,6"
                    fill={isSelected ? '#312e81' : isLive ? '#5c4033' : '#374151'}
                    stroke={isSelected ? '#818cf8' : '#64748b'}
                    strokeWidth="1.2"
                  />
                  {/* Desk Front Edge Thickness */}
                  <polygon points="-48,6 0,26 0,32 -48,12" fill="#27272a" />
                  <polygon points="48,6 0,26 0,32 48,12" fill="#18181b" />

                  {/* Monitor */}
                  <polygon
                    points="-18,-26 14,-13 14,3 -18,-10"
                    fill={isLive ? '#38bdf8' : '#0f172a'}
                    stroke="#475569"
                    strokeWidth="2"
                  />
                  {isLive && (
                    <polygon points="-14,-22 10,-12 10,-1 -14,-11" fill="#e0f2fe" opacity="0.55" />
                  )}

                  {/* Desk Lamp */}
                  <line x1="28" y1="4" x2="28" y2="-16" stroke="#94a3b8" strokeWidth="2" />
                  <polygon
                    points="22,-16 34,-16 30,-24 26,-24"
                    fill={isLive ? '#fbbf24' : '#64748b'}
                  />

                  {/* Seated Anime Avatar */}
                  {entry ? (
                    <AnimeCharacterSvg
                      identity={resolveStudyAvatarIdentity(entry)}
                      isLive={isLive}
                      activity={deriveStudyActivity(entry)}
                      variant="seated"
                    />
                  ) : (
                    <text
                      x="0"
                      y="10"
                      textAnchor="middle"
                      fontSize="9"
                      fill="#94a3b8"
                      fontFamily="ui-monospace, monospace"
                    >
                      Open Seat
                    </text>
                  )}

                  {/* Floating Name + Status Pill (Green pulsing Live vs Grey Offline/Idle) */}
                  {entry && (
                    <g transform="translate(0, -48)">
                      <rect
                        x="-62"
                        y="-14"
                        width="124"
                        height={28}
                        rx="8"
                        fill="#0f172a"
                        fillOpacity="0.92"
                        stroke={isLive ? '#34d399' : '#475569'}
                        strokeWidth={isLive ? '1.35' : '1'}
                      />
                      <circle
                        cx="-50"
                        cy="-5"
                        r="3.2"
                        fill={isLive ? '#22c55e' : '#64748b'}
                      >
                        {isLive && (
                          <animate
                            attributeName="opacity"
                            values="1;0.35;1"
                            dur="1.4s"
                            repeatCount="indefinite"
                          />
                        )}
                      </circle>
                      <text
                        x="3"
                        y="-2"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill="#f8fafc"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {entry.displayName.length > 12
                          ? `${entry.displayName.slice(0, 11)}…`
                          : entry.displayName}
                      </text>
                      {isLive ? (
                        <text
                          x="0"
                          y="10"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="600"
                          fill="#6ee7b7"
                          fontFamily="ui-monospace, monospace"
                        >
                          Live · {(entry.activeSubject || 'Focus').slice(0, 9)} ·{' '}
                          {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
                        </text>
                      ) : (
                        <text
                          x="0"
                          y="10"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="500"
                          fill="#94a3b8"
                          fontFamily="ui-monospace, monospace"
                        >
                          Offline · #{entry.rank}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* MODE 2: INTERACTIVE 3D STUDY PODS */}
      {roomStyle === 'pods' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {roomSeatedEntries.length === 0 ? (
            <div className="col-span-full p-8 rounded-2xl border border-dashed border-[var(--ff-border-color)] text-center text-xs text-[var(--ff-text-muted)] space-y-3">
              <p>No squad members in this study room yet.</p>
              <button
                type="button"
                onClick={onStartFocus}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--ff-accent)] text-white hover:opacity-90 inline-flex items-center gap-1.5"
              >
                <Timer className="w-3.5 h-3.5" />
                <span>Turn On Focus Mode</span>
              </button>
            </div>
          ) : (
            roomSeatedEntries.map((entry) => (
              <SpatialStudyPodCard
                key={entry.uid}
                entry={entry}
                isSelected={selectedEntry?.uid === entry.uid}
                onSelect={() => setSelectedUid(entry.uid)}
              />
            ))
          )}
        </div>
      )}

      {/* MODE 3: 360° WEBGL 3D ROOM (Lazy-Loaded Three.js) */}
      {roomStyle === 'webgl' && (
        <Suspense
          fallback={
            <div className="h-[380px] sm:h-[460px] rounded-2xl border border-[var(--ff-border-color)] bg-[#0b1020] flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
              <Box className="w-6 h-6 text-indigo-400 animate-spin" />
              <span>Loading 360° 3D Study Room...</span>
            </div>
          }
        >
          <LazySquadWebGLRoom
            entries={roomSeatedEntries}
            selectedUid={selectedEntry?.uid || null}
            onSelectMember={(uid) => setSelectedUid(uid)}
            ambiance={ambiance}
            customization={localCustomization}
            onUpdateCustomization={handleUpdateCustomization}
          />
        </Suspense>
      )}

      {/* Selected Desk Inspector Bar */}
      {selectedEntry && (
        <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <AnimeCharacterSvg
                identity={resolveStudyAvatarIdentity(selectedEntry)}
                isLive={selectedEntry.isStudyingLive}
                activity={deriveStudyActivity(selectedEntry)}
                variant="bust"
                className="w-11 h-11 rounded-xl shadow-sm"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                  {selectedEntry.displayName}
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]">
                  Rank #{selectedEntry.rank}
                </span>
                {selectedEntry.isStudyingLive ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {ACTIVITY_META[deriveStudyActivity(selectedEntry)].badgeText} ·{' '}
                    {selectedEntry.activeSubject || 'Deep Focus'} ·{' '}
                    {selectedEntry.liveElapsedMinutes > 0 ? `${selectedEntry.liveElapsedMinutes}m` : '<1m'}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--ff-text-muted)]">
                    {ACTIVITY_META[deriveStudyActivity(selectedEntry)].badgeText} · Offline
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-[var(--ff-text-muted)] mt-1 flex-wrap">
                <span>
                  {periodLabel}:{' '}
                  <strong className="font-mono text-[var(--ff-text-primary)]">
                    {selectedEntry.hoursFormatted}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-amber-400">
                  <Flame className="w-3.5 h-3.5" />
                  {selectedEntry.streakDays}d streak
                </span>
                <span>
                  Daily Goal:{' '}
                  <strong className="font-mono text-[var(--ff-text-primary)]">
                    {selectedEntry.goalProgressPct}%
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {squad && onCopyInvite && (
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => onCopyInvite(squad.inviteCode)}
                className="flex items-center gap-1.5"
              >
                {copiedCode === squad.inviteCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Invite ({squad.inviteCode})</span>
              </ThemeButton>
            )}
            {onStartFocus && (
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={onStartFocus}
                className="flex items-center gap-1.5"
              >
                <Timer className="w-3.5 h-3.5" />
                <span>Take Your Seat</span>
              </ThemeButton>
            )}
          </div>
        </div>
      )}

      {/* Room Empty Footer Hint */}
      {entries.length > 0 && entries.length < 4 && squad && (
        <div className="px-4 py-2.5 rounded-xl bg-[var(--ff-surface-muted)]/50 border border-dashed border-[var(--ff-border-color)] flex items-center justify-between gap-2 text-[11px] text-[var(--ff-text-muted)]">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            {8 - entries.length} open desks left in this room — share code <strong className="font-mono text-[var(--ff-text-primary)]">{squad.inviteCode}</strong> to fill them up.
          </span>
        </div>
      )}
    </div>
  );
};
