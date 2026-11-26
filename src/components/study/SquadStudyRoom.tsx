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

import React, { Suspense, lazy, useMemo, useState } from 'react';
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
import { ThemeButton } from '../ui/ThemePrimitives.tsx';

const LazySquadWebGLRoom = lazy(() => import('./SquadWebGLRoom.tsx'));

export type StudyRoomStyle = 'isometric' | 'pods' | 'webgl';

interface SquadStudyRoomProps {
  squad: StudySquad | null;
  entries: RankedLeaderboardEntry[];
  periodLabel: string;
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

        {/* Mini 3D Monitor + Seated Avatar Stage */}
        <div
          className={`relative rounded-xl p-3 mb-3 border flex items-center gap-3 ${
            entry.isStudyingLive
              ? 'bg-slate-950/70 border-sky-400/30 shadow-inner'
              : 'bg-[var(--ff-surface-muted)]/60 border-[var(--ff-border-color)]/70'
          }`}
        >
          <div className="relative shrink-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md"
              style={{ backgroundColor: entry.avatarColor }}
            >
              {entry.displayName.slice(0, 1).toUpperCase()}
            </div>
            {entry.isStudyingLive && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-slate-950" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
              {entry.displayName}
              {entry.isCurrentUser && (
                <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ff-accent)]/20 text-[var(--ff-accent-text)]">
                  You
                </span>
              )}
            </div>
            <div className="text-[11px] truncate mt-0.5 font-mono">
              {entry.isStudyingLive ? (
                <span className="text-sky-300">
                  {entry.activeSubject || 'Deep Focus'} ·{' '}
                  {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
                </span>
              ) : (
                <span className="text-[var(--ff-text-muted)]">Desk resting</span>
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
  onCopyInvite,
  copiedCode,
  onStartFocus,
}) => {
  const [roomStyle, setRoomStyle] = useState<StudyRoomStyle>('isometric');
  const [ambiance, setAmbiance] = useState<'night' | 'dusk'>(() => {
    const hr = new Date().getHours();
    return hr >= 6 && hr < 18 ? 'dusk' : 'night';
  });
  const [selectedUid, setSelectedUid] = useState<string | null>(
    () => entries.find((e) => e.isStudyingLive)?.uid || entries[0]?.uid || null
  );

  const selectedEntry = useMemo(
    () => entries.find((e) => e.uid === selectedUid) || entries[0] || null,
    [entries, selectedUid]
  );

  const liveCount = useMemo(
    () => entries.filter((e) => e.isStudyingLive).length,
    [entries]
  );

  const isNight = ambiance === 'night';

  return (
    <div className="space-y-4">
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
            onClick={() => setAmbiance((a) => (a === 'night' ? 'dusk' : 'night'))}
            className="p-2 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
            title={isNight ? 'Switch to Warm Dusk Ambiance' : 'Switch to Night Lo-Fi Ambiance'}
          >
            {isNight ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
          </button>
        </div>
      </div>

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

            {/* Left-Wall Ambient Window with Moon/Stars */}
            <polygon points="210,138 355,80 355,148 210,206" fill="url(#window-sky)" stroke="#475569" strokeWidth="3" />
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

            {/* Right-Wall Bookshelf */}
            <polygon points="560,86 710,146 710,214 560,154" fill="#2c2220" stroke="#475569" strokeWidth="1.5" />
            <line x1="560" y1="120" x2="710" y2="180" stroke="#57433f" strokeWidth="2" />
            <polygon points="576,99 588,104 588,128 576,123" fill="#6366f1" />
            <polygon points="592,106 604,111 604,135 592,130" fill="#10b981" />
            <polygon points="608,113 620,118 620,142 608,137" fill="#f59e0b" />
            <polygon points="638,125 650,130 650,154 638,149" fill="#ec4899" />
            <polygon points="656,133 668,138 668,162 656,157" fill="#38bdf8" />

            {/* Render up to 8 Isometric Desks */}
            {ISO_SEAT_POSITIONS.map((pos, idx) => {
              const entry = entries[idx] || null;
              const isLive = Boolean(entry?.isStudyingLive);
              const isSelected = Boolean(entry && selectedEntry?.uid === entry.uid);

              return (
                <g
                  key={`iso-desk-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => entry && setSelectedUid(entry.uid)}
                  className={entry ? 'cursor-pointer' : 'opacity-45'}
                >
                  {/* Warm Lamp Pool on Desk */}
                  {isLive && <ellipse cx="0" cy="-12" rx="68" ry="38" fill="url(#lamp-glow)" />}

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

                  {/* Seated Avatar */}
                  {entry ? (
                    <g transform="translate(0, 14)">
                      {/* Chair Back */}
                      <rect x="-13" y="4" width="26" height="16" rx="5" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                      {/* Body */}
                      <circle cx="0" cy="-2" r="12" fill={entry.avatarColor} stroke="#0f172a" strokeWidth="1.5" />
                      {/* Head */}
                      <circle cx="0" cy="-16" r="8.5" fill={isLive ? '#fde68a' : '#cbd5e1'} />
                      {/* Live Pulse Dot */}
                      {isLive && (
                        <circle cx="11" cy="-22" r="4" fill="#ef4444" stroke="#0f172a" strokeWidth="1.5">
                          <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
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

                  {/* Floating Name + Status Pill */}
                  {entry && (
                    <g transform="translate(0, -48)">
                      <rect
                        x="-58"
                        y="-14"
                        width="116"
                        height={isLive ? 28 : 20}
                        rx="8"
                        fill="#0f172a"
                        fillOpacity="0.9"
                        stroke={isLive ? '#f87171' : '#334155'}
                        strokeWidth={isLive ? '1.3' : '1'}
                      />
                      <text
                        x="0"
                        y="-2"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill="#f8fafc"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {entry.displayName.length > 13
                          ? `${entry.displayName.slice(0, 12)}…`
                          : entry.displayName}
                      </text>
                      {isLive && (
                        <text
                          x="0"
                          y="10"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="600"
                          fill="#fca5a5"
                          fontFamily="ui-monospace, monospace"
                        >
                          {(entry.activeSubject || 'Deep Focus').slice(0, 12)} ·{' '}
                          {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
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
          {entries.length === 0 ? (
            <div className="col-span-full p-8 rounded-2xl border border-dashed border-[var(--ff-border-color)] text-center text-xs text-[var(--ff-text-muted)]">
              No squad members seated yet. Share your invite code or sync your study hours to take the first desk!
            </div>
          ) : (
            entries.map((entry) => (
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
            entries={entries}
            selectedUid={selectedEntry?.uid || null}
            onSelectMember={(uid) => setSelectedUid(uid)}
            ambiance={ambiance}
          />
        </Suspense>
      )}

      {/* Selected Desk Inspector Bar */}
      {selectedEntry && (
        <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm"
                style={{ backgroundColor: selectedEntry.avatarColor }}
              >
                {selectedEntry.displayName.slice(0, 1).toUpperCase()}
              </div>
              {selectedEntry.isStudyingLive && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-[var(--ff-surface-card)] animate-pulse" />
              )}
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
                    Studying {selectedEntry.activeSubject || 'Deep Focus'} ·{' '}
                    {selectedEntry.liveElapsedMinutes > 0 ? `${selectedEntry.liveElapsedMinutes}m` : '<1m'}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--ff-text-muted)]">Currently offline</span>
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
