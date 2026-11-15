import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Globe,
  Maximize2,
  Minimize2,
  Plus,
  Timer,
  X,
  ArrowLeftRight,
  Sunrise,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { DEFAULT_TIMEZONE, getZonedDateParts } from '../../lib/dateTime.ts';
import { ThemeButton, ThemeCard, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import { RollingTimerDigits, useMotionPreferences } from '../ui/MotionPrimitives.tsx';

type ClockDisplayMode = 'both' | 'analog' | 'digital';
type ClockFormat = '12h' | '24h';
type SecondHandMotion = 'sweep' | 'tick';

interface WorldZoneOption {
  id: string;
  city: string;
  region: string;
}

const WORLD_TIMEZONES: WorldZoneOption[] = [
  { id: 'Asia/Kolkata', city: 'Kolkata / Mumbai', region: 'India (IST)' },
  { id: 'UTC', city: 'UTC', region: 'Coordinated Universal Time' },
  { id: 'America/New_York', city: 'New York', region: 'US Eastern' },
  { id: 'America/Chicago', city: 'Chicago', region: 'US Central' },
  { id: 'America/Los_Angeles', city: 'San Francisco / LA', region: 'US Pacific' },
  { id: 'America/Toronto', city: 'Toronto', region: 'Canada Eastern' },
  { id: 'Europe/London', city: 'London', region: 'United Kingdom' },
  { id: 'Europe/Paris', city: 'Paris', region: 'Central Europe' },
  { id: 'Europe/Berlin', city: 'Berlin', region: 'Central Europe' },
  { id: 'Asia/Dubai', city: 'Dubai', region: 'Gulf Standard' },
  { id: 'Asia/Singapore', city: 'Singapore', region: 'Southeast Asia' },
  { id: 'Asia/Tokyo', city: 'Tokyo', region: 'Japan Standard' },
  { id: 'Asia/Seoul', city: 'Seoul', region: 'Korea Standard' },
  { id: 'Australia/Sydney', city: 'Sydney', region: 'Australian Eastern' },
  { id: 'Pacific/Auckland', city: 'Auckland', region: 'New Zealand' },
];

const PREFS_STORAGE_KEY = 'ff_realclock_prefs_v1';
const WORLD_CLOCKS_STORAGE_KEY = 'ff_world_clocks_v1';

interface RealClockPrefs {
  displayMode: ClockDisplayMode;
  hourFormat: ClockFormat;
  secondMotion: SecondHandMotion;
  primaryTimezone?: string;
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function loadPrefs(fallbackTimezone: string): RealClockPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RealClockPrefs>;
      return {
        displayMode:
          parsed.displayMode === 'analog' || parsed.displayMode === 'digital' || parsed.displayMode === 'both'
            ? parsed.displayMode
            : 'both',
        hourFormat: parsed.hourFormat === '24h' ? '24h' : '12h',
        secondMotion: parsed.secondMotion === 'tick' ? 'tick' : 'sweep',
        primaryTimezone: parsed.primaryTimezone || fallbackTimezone,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    displayMode: 'both',
    hourFormat: '12h',
    secondMotion: 'sweep',
    primaryTimezone: fallbackTimezone,
  };
}

function loadWorldClocks(primaryTimezone: string): string[] {
  const defaults = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Dubai'];
  try {
    const raw = localStorage.getItem(WORLD_CLOCKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return defaults.filter((tz) => tz !== primaryTimezone).slice(0, 4);
}

/**
 * Returns timezone offset in minutes relative to UTC for a given Date.
 */
function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const utcParts = getZonedDateParts(date, 'UTC');
    const tzParts = getZonedDateParts(date, timeZone);
    const utcEpoch = Date.UTC(
      utcParts.year,
      utcParts.month - 1,
      utcParts.day,
      utcParts.hour,
      utcParts.minute,
      utcParts.second
    );
    const tzEpoch = Date.UTC(
      tzParts.year,
      tzParts.month - 1,
      tzParts.day,
      tzParts.hour,
      tzParts.minute,
      tzParts.second
    );
    return Math.round((tzEpoch - utcEpoch) / 60000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hrs = Math.floor(abs / 60);
  const mins = abs % 60;
  return `UTC${sign}${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatDeltaFromPrimary(deltaMinutes: number): string {
  if (deltaMinutes === 0) return 'Same time';
  const sign = deltaMinutes > 0 ? '+' : '-';
  const abs = Math.abs(deltaMinutes);
  const hrs = Math.floor(abs / 60);
  const mins = abs % 60;
  if (mins === 0) return `${sign}${hrs}h`;
  return `${sign}${hrs}h ${mins}m`;
}

function getIsoWeekAndDayOfYear(year: number, month: number, day: number): {
  isoWeek: number;
  dayOfYear: number;
  daysInYear: number;
} {
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  const dayOfYear = Math.floor((utcDate.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const daysInYear = Math.floor((endOfYear.getTime() - startOfYear.getTime()) / 86400000) + 1;

  // ISO-8601 week number
  const d = new Date(utcDate.getTime());
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return { isoWeek, dayOfYear, daysInYear };
}

function formatZoneDisplayName(tzId: string): { city: string; region: string } {
  const known = WORLD_TIMEZONES.find((z) => z.id === tzId);
  if (known) return { city: known.city, region: known.region };
  const segments = tzId.split('/');
  const city = (segments[segments.length - 1] || tzId).replace(/_/g, ' ');
  const region = segments.length > 1 ? segments[0].replace(/_/g, ' ') : 'Timezone';
  return { city, region };
}

export interface AnalogClockDialProps {
  hour: number;
  minute: number;
  second: number;
  millisecond?: number;
  day?: number;
  sweep?: boolean;
  sizeClassName?: string;
  showNumerals?: boolean;
  showDateWindow?: boolean;
}

/**
 * Reusable precision SVG analog clock dial styled exclusively with --ff-* theme tokens.
 */
export const AnalogClockDial: React.FC<AnalogClockDialProps> = ({
  hour,
  minute,
  second,
  millisecond = 0,
  day,
  sweep = true,
  sizeClassName = 'w-64 h-64 sm:w-80 sm:h-80',
  showNumerals = true,
  showDateWindow = true,
}) => {
  const fractionalSecond = sweep ? second + millisecond / 1000 : second;
  const secondAngle = fractionalSecond * 6;
  const minuteAngle = (minute + fractionalSecond / 60) * 6;
  const hourAngle = ((hour % 12) + minute / 60 + fractionalSecond / 3600) * 30;

  const ticks = useMemo(() => {
    return Array.from({ length: 60 }, (_, idx) => {
      const isHourTick = idx % 5 === 0;
      const angleRad = ((idx * 6 - 90) * Math.PI) / 180;
      const outerR = 144;
      const innerR = isHourTick ? 131 : 138;
      return {
        idx,
        isHourTick,
        x1: 160 + outerR * Math.cos(angleRad),
        y1: 160 + outerR * Math.sin(angleRad),
        x2: 160 + innerR * Math.cos(angleRad),
        y2: 160 + innerR * Math.sin(angleRad),
      };
    });
  }, []);

  const numerals = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const value = idx === 0 ? 12 : idx;
      const angleRad = ((idx * 30 - 90) * Math.PI) / 180;
      const radius = 111;
      return {
        value,
        x: 160 + radius * Math.cos(angleRad),
        y: 160 + radius * Math.sin(angleRad),
      };
    });
  }, []);

  return (
    <svg
      viewBox="0 0 320 320"
      className={`${sizeClassName} select-none`}
      role="img"
      aria-label={`Analog clock showing ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`}
    >
      {/* Dial Surface & Outer Bezel (Styled with inline CSS properties for 100% SVG cross-browser support) */}
      <circle
        cx="160"
        cy="160"
        r="154"
        style={{
          fill: 'var(--ff-surface-subtle, var(--ff-card-bg, #ffffff))',
          stroke: 'var(--ff-border-strong, #cbd5e1)',
          strokeWidth: 2.5,
        }}
      />
      <circle
        cx="160"
        cy="160"
        r="148"
        style={{
          fill: 'var(--ff-card-bg, #ffffff)',
          stroke: 'var(--ff-border-color, #e2e8f0)',
          strokeOpacity: 0.6,
          strokeWidth: 1.5,
        }}
      />

      {/* Subtle Inner Chapter Ring */}
      {showNumerals && (
        <circle
          cx="160"
          cy="160"
          r="94"
          fill="none"
          style={{
            stroke: 'var(--ff-border-color, #cbd5e1)',
            strokeOpacity: 0.28,
            strokeWidth: 0.75,
          }}
        />
      )}

      {/* 60 Minute & Hour Indices */}
      {ticks.map((t) => (
        <line
          key={t.idx}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          strokeLinecap="round"
          style={{
            stroke: t.isHourTick ? 'var(--ff-text-primary, #0f172a)' : 'var(--ff-text-muted, #94a3b8)',
            strokeOpacity: t.isHourTick ? 0.9 : 0.45,
            strokeWidth: t.isHourTick ? 2.4 : 1.1,
          }}
        />
      ))}

      {/* Hour Numerals */}
      {showNumerals &&
        numerals.map((n) => (
          <text
            key={n.value}
            x={n.x}
            y={n.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={n.value % 3 === 0 ? '16' : '13.5'}
            fontWeight={n.value % 3 === 0 ? '700' : '600'}
            style={{
              fill: 'var(--ff-text-primary, #0f172a)',
              fontFamily: 'var(--ff-font-display, inherit)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {n.value}
          </text>
        ))}

      {/* Horological Date Aperture at 6 o'clock (kept clear of 3 o'clock numeral) */}
      {showDateWindow && day !== undefined && (
        <g transform="translate(160, 212)">
          <rect
            x="-17"
            y="-12"
            width="34"
            height="24"
            rx="5"
            style={{
              fill: 'var(--ff-surface-subtle, #f8fafc)',
              stroke: 'var(--ff-border-color, #e2e8f0)',
              strokeWidth: 1.2,
            }}
          />
          <text
            x="0"
            y="1"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="12"
            fontWeight="700"
            style={{
              fill: 'var(--ff-accent-text, #6366f1)',
              fontFamily: 'var(--ff-font-mono, monospace)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {String(day).padStart(2, '0')}
          </text>
        </g>
      )}

      {/* Hour Hand */}
      <g transform={`rotate(${hourAngle} 160 160)`}>
        <line
          x1="160"
          y1="176"
          x2="160"
          y2="82"
          strokeLinecap="round"
          style={{
            stroke: 'var(--ff-text-primary, #0f172a)',
            strokeWidth: 6.5,
          }}
        />
      </g>

      {/* Minute Hand */}
      <g transform={`rotate(${minuteAngle} 160 160)`}>
        <line
          x1="160"
          y1="180"
          x2="160"
          y2="46"
          strokeLinecap="round"
          style={{
            stroke: 'var(--ff-text-primary, #0f172a)',
            strokeWidth: 4.2,
          }}
        />
      </g>

      {/* Counterweighted Second Hand */}
      <g transform={`rotate(${secondAngle} 160 160)`}>
        <line
          x1="160"
          y1="194"
          x2="160"
          y2="34"
          strokeLinecap="round"
          style={{
            stroke: 'var(--ff-accent, #6366f1)',
            strokeWidth: 2,
          }}
        />
        <circle cx="160" cy="186" r="3.2" style={{ fill: 'var(--ff-accent, #6366f1)' }} />
      </g>

      {/* Center Pinion Jewel */}
      <circle cx="160" cy="160" r="6.5" style={{ fill: 'var(--ff-accent, #6366f1)' }} />
      <circle cx="160" cy="160" r="2.6" style={{ fill: 'var(--ff-surface-card, #ffffff)' }} />
    </svg>
  );
};

export const RealClock: React.FC = () => {
  const { settings, setCurrentTab, isRunning, timeLeft } = useApp();
  const { isDisabled } = useMotionPreferences();

  const defaultTimezone = settings?.timezone || getDeviceTimezone() || DEFAULT_TIMEZONE;
  const initialPrefs = useMemo(() => loadPrefs(defaultTimezone), [defaultTimezone]);

  const [displayMode, setDisplayMode] = useState<ClockDisplayMode>(initialPrefs.displayMode);
  const [hourFormat, setHourFormat] = useState<ClockFormat>(initialPrefs.hourFormat);
  const [secondMotion, setSecondMotion] = useState<SecondHandMotion>(initialPrefs.secondMotion);
  const [primaryTimezone, setPrimaryTimezone] = useState<string>(
    initialPrefs.primaryTimezone || defaultTimezone
  );
  const [worldClocks, setWorldClocks] = useState<string[]>(() =>
    loadWorldClocks(initialPrefs.primaryTimezone || defaultTimezone)
  );
  const [cityToAdd, setCityToAdd] = useState<string>('');
  const [fullScreenClock, setFullScreenClock] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Persist user clock preferences
  useEffect(() => {
    try {
      const prefs: RealClockPrefs = {
        displayMode,
        hourFormat,
        secondMotion,
        primaryTimezone,
      };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage errors
    }
  }, [displayMode, hourFormat, secondMotion, primaryTimezone]);

  useEffect(() => {
    try {
      localStorage.setItem(WORLD_CLOCKS_STORAGE_KEY, JSON.stringify(worldClocks));
    } catch {
      // ignore storage errors
    }
  }, [worldClocks]);

  // Escape exits full-screen ambient desk clock
  useEffect(() => {
    if (!fullScreenClock) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullScreenClock(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullScreenClock]);

  // Real-time ticker: 60fps RAF for smooth sweep when enabled; 1Hz interval otherwise
  const effectiveSweep = secondMotion === 'sweep' && !isDisabled && displayMode !== 'digital';

  useEffect(() => {
    if (effectiveSweep) {
      let frameId = 0;
      const tick = () => {
        if (!document.hidden) {
          setNowMs(Date.now());
        }
        frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frameId);
    }

    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, [effectiveSweep]);

  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const milliseconds = nowDate.getMilliseconds();
  const primaryParts = getZonedDateParts(nowDate, primaryTimezone);
  const primaryOffsetMinutes = getTimezoneOffsetMinutes(nowDate, primaryTimezone);
  const primaryUtcOffset = formatUtcOffset(primaryOffsetMinutes);
  const primaryZoneMeta = formatZoneDisplayName(primaryTimezone);

  const formattedDigital = useMemo(() => {
    const h24 = primaryParts.hour;
    const m = String(primaryParts.minute).padStart(2, '0');
    const s = String(primaryParts.second).padStart(2, '0');
    if (hourFormat === '24h') {
      return {
        timeText: `${String(h24).padStart(2, '0')}:${m}:${s}`,
        period: '',
      };
    }
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return {
      timeText: `${String(h12).padStart(2, '0')}:${m}:${s}`,
      period,
    };
  }, [primaryParts.hour, primaryParts.minute, primaryParts.second, hourFormat]);

  const formattedLongDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: primaryTimezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(nowDate);
    } catch {
      return nowDate.toDateString();
    }
  }, [nowDate, primaryTimezone]);

  const { isoWeek, dayOfYear, daysInYear } = getIsoWeekAndDayOfYear(
    primaryParts.year,
    primaryParts.month,
    primaryParts.day
  );

  // Day progress percentage in primary timezone
  const secondsElapsedToday =
    primaryParts.hour * 3600 + primaryParts.minute * 60 + primaryParts.second;
  const dayProgressPct = Math.min(100, Math.max(0, (secondsElapsedToday / 86400) * 100));
  const secondsRemainingToday = Math.max(0, 86400 - secondsElapsedToday);
  const remainingHours = Math.floor(secondsRemainingToday / 3600);
  const remainingMins = Math.floor((secondsRemainingToday % 3600) / 60);

  const availableCitiesToAdd = useMemo(() => {
    return WORLD_TIMEZONES.filter(
      (z) => z.id !== primaryTimezone && !worldClocks.includes(z.id)
    );
  }, [primaryTimezone, worldClocks]);

  const primarySelectorOptions = useMemo(() => {
    const localTz = getDeviceTimezone();
    const seen = new Set<string>();
    const options: Array<{ id: string; label: string }> = [];

    const pushOption = (id: string, customLabel?: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const meta = formatZoneDisplayName(id);
      options.push({
        id,
        label: customLabel || `${meta.city} (${id})`,
      });
    };

    pushOption(localTz, `Device Local — ${formatZoneDisplayName(localTz).city} (${localTz})`);
    if (settings?.timezone) {
      pushOption(
        settings.timezone,
        `Workspace Default — ${formatZoneDisplayName(settings.timezone).city} (${settings.timezone})`
      );
    }
    for (const tz of WORLD_TIMEZONES) {
      pushOption(tz.id, `${tz.city} — ${tz.region}`);
    }
    return options;
  }, [settings?.timezone]);

  const handleAddWorldClock = (tzId: string) => {
    if (!tzId || worldClocks.includes(tzId) || tzId === primaryTimezone) return;
    setWorldClocks((prev) => [...prev, tzId]);
    setCityToAdd('');
  };

  const handleRemoveWorldClock = (tzId: string) => {
    setWorldClocks((prev) => prev.filter((item) => item !== tzId));
  };

  const handleSwapPrimary = (tzId: string) => {
    const oldPrimary = primaryTimezone;
    setPrimaryTimezone(tzId);
    setWorldClocks((prev) => {
      const withoutNew = prev.filter((item) => item !== tzId);
      if (oldPrimary && oldPrimary !== tzId && !withoutNew.includes(oldPrimary)) {
        return [oldPrimary, ...withoutNew];
      }
      return withoutNew;
    });
  };

  const primaryDayKey = `${primaryParts.year}-${String(primaryParts.month).padStart(2, '0')}-${String(primaryParts.day).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {/* Full-Screen Desk Clock Overlay */}
      {fullScreenClock && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-10 bg-[var(--ff-bg-canvas)] text-[var(--ff-text-primary)] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Full-Screen Real Clock"
        >
          <div className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs sm:text-sm font-medium text-[var(--ff-text-muted)]">
              <span className="font-semibold text-[var(--ff-text-primary)]">{primaryZoneMeta.city}</span>
              {' · '}
              <span className="font-mono tabular-nums">{primaryUtcOffset}</span>
              {' · '}
              <span>{formattedLongDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => setHourFormat((prev) => (prev === '12h' ? '24h' : '12h'))}
              >
                <span>{hourFormat === '12h' ? '24h' : '12h'}</span>
              </ThemeButton>
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => setSecondMotion((prev) => (prev === 'sweep' ? 'tick' : 'sweep'))}
                disabled={isDisabled}
              >
                <span>{secondMotion === 'sweep' ? '1Hz Tick' : 'Smooth Sweep'}</span>
              </ThemeButton>
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={() => setFullScreenClock(false)}
                aria-label="Exit Full-Screen Clock"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Exit Desk Mode</span>
              </ThemeButton>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16 my-auto py-8">
            {displayMode !== 'digital' && (
              <AnalogClockDial
                hour={primaryParts.hour}
                minute={primaryParts.minute}
                second={primaryParts.second}
                millisecond={milliseconds}
                day={primaryParts.day}
                sweep={effectiveSweep}
                sizeClassName="w-72 h-72 sm:w-96 sm:h-96"
              />
            )}

            {displayMode !== 'analog' && (
              <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono tabular-nums text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight text-[var(--ff-text-primary)] leading-none">
                    <RollingTimerDigits value={formattedDigital.timeText} />
                  </span>
                  {formattedDigital.period && (
                    <span className="font-mono text-xl sm:text-3xl font-bold text-[var(--ff-accent-text)]">
                      {formattedDigital.period}
                    </span>
                  )}
                </div>
                <p className="text-sm sm:text-base text-[var(--ff-text-secondary)] font-medium">
                  {formattedLongDate} · Week {isoWeek} · {dayProgressPct.toFixed(1)}% of day elapsed
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--ff-text-muted)]">
            Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--ff-border-color)] font-mono">Esc</kbd> to return to workspace
          </p>
        </div>
      )}

      {/* Top Controls Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-[var(--ff-accent-text)]" />
            <h2 className="ff-heading text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--ff-text-primary)]">
              Real Clock &amp; World Time
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--ff-text-muted)]">
            Synchronized analog &amp; digital horology &middot; {primaryZoneMeta.city} ({primaryUtcOffset})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ThemeSegmentedControl<ClockDisplayMode>
            ariaLabel="Clock display mode"
            value={displayMode}
            onChange={setDisplayMode}
            options={[
              { id: 'both', label: 'Both' },
              { id: 'analog', label: 'Analog' },
              { id: 'digital', label: 'Digital' },
            ]}
          />

          <ThemeSegmentedControl<ClockFormat>
            ariaLabel="Clock hour format"
            value={hourFormat}
            onChange={setHourFormat}
            options={[
              { id: '12h', label: '12H' },
              { id: '24h', label: '24H' },
            ]}
          />

          <ThemeSegmentedControl<SecondHandMotion>
            ariaLabel="Second hand motion"
            value={secondMotion}
            onChange={setSecondMotion}
            options={[
              { id: 'sweep', label: 'Sweep' },
              { id: 'tick', label: '1Hz Tick' },
            ]}
          />

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setFullScreenClock(true)}
            title="Open Full-Screen Desk Clock"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="whitespace-nowrap">Desk Mode</span>
          </ThemeButton>

          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => setCurrentTab('focus')}
            title="Switch to Focus & Pomodoro Timer"
          >
            <Timer className="w-4 h-4" />
            <span className="whitespace-nowrap">
              {isRunning
                ? `Focus ${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`
                : 'Focus Timer'}
            </span>
          </ThemeButton>
        </div>
      </div>

      {/* Primary Timepiece Showcase */}
      <ThemeCard className="p-6 sm:p-8 lg:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Analog Face */}
          {displayMode !== 'digital' && (
            <div
              className={`${
                displayMode === 'analog' ? 'lg:col-span-12' : 'lg:col-span-5'
              } flex flex-col items-center justify-center`}
            >
              <AnalogClockDial
                hour={primaryParts.hour}
                minute={primaryParts.minute}
                second={primaryParts.second}
                millisecond={milliseconds}
                day={primaryParts.day}
                sweep={effectiveSweep}
                sizeClassName={
                  displayMode === 'analog'
                    ? 'w-72 h-72 sm:w-96 sm:h-96'
                    : 'w-64 h-64 sm:w-80 sm:h-80'
                }
              />
            </div>
          )}

          {/* Digital Readout, Timezone Switcher & Day Progress */}
          <div
            className={`${
              displayMode === 'digital'
                ? 'lg:col-span-12 max-w-3xl mx-auto w-full'
                : displayMode === 'analog'
                  ? 'lg:col-span-12 max-w-2xl mx-auto w-full'
                  : 'lg:col-span-7'
            } flex flex-col gap-6`}
          >
            {displayMode !== 'analog' && (
              <div className={displayMode === 'digital' ? 'text-center space-y-2' : 'space-y-2'}>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--ff-accent-text)]">
                  {primaryZoneMeta.city} · {primaryZoneMeta.region}
                </p>
                <div
                  className={`flex items-baseline gap-3 ${
                    displayMode === 'digital' ? 'justify-center' : 'justify-start'
                  }`}
                >
                  <span className="font-mono tabular-nums text-5xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight text-[var(--ff-text-primary)] leading-none">
                    <RollingTimerDigits value={formattedDigital.timeText} />
                  </span>
                  {formattedDigital.period && (
                    <span className="font-mono text-xl sm:text-2xl font-bold text-[var(--ff-accent-text)]">
                      {formattedDigital.period}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Unboxed Horological Metadata Strip (Zero-Pill Discipline) */}
            <div
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-[var(--ff-text-secondary)] ${
                displayMode !== 'both' ? 'justify-center' : ''
              }`}
            >
              <span className="font-semibold text-[var(--ff-text-primary)]">
                {formattedLongDate}
              </span>
              <span className="text-[var(--ff-text-muted)]" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{primaryUtcOffset}</span>
              <span className="text-[var(--ff-text-muted)]" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Week {isoWeek}</span>
              <span className="text-[var(--ff-text-muted)]" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Day {dayOfYear}/{daysInYear}
              </span>
            </div>

            {/* Day Progress Bar */}
            <div className="pt-4 border-t border-[var(--ff-border-color)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--ff-text-secondary)]">
                  <Sunrise className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                  <span>24-Hour Day Progress</span>
                </span>
                <span className="font-mono tabular-nums text-[var(--ff-text-muted)]">
                  <strong className="text-[var(--ff-text-primary)]">
                    {dayProgressPct.toFixed(1)}%
                  </strong>
                  {' · '}
                  {remainingHours}h {String(remainingMins).padStart(2, '0')}m remaining
                </span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--ff-surface-muted)' }}
                role="progressbar"
                aria-valuenow={Math.round(dayProgressPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="24-hour day progress"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${dayProgressPct.toFixed(2)}%`,
                    background: 'var(--ff-accent)',
                  }}
                />
              </div>
            </div>

            {/* Primary Timezone Selector */}
            <div className="pt-4 border-t border-[var(--ff-border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label
                htmlFor="primary-clock-tz"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                <span>Primary Timezone</span>
              </label>
              <select
                id="primary-clock-tz"
                value={primaryTimezone}
                onChange={(e) => setPrimaryTimezone(e.target.value)}
                className="ff-input text-sm py-2 px-3 min-h-[42px] sm:max-w-sm w-full"
              >
                {primarySelectorOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </ThemeCard>

      {/* World Clocks Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="ff-heading text-lg font-bold text-[var(--ff-text-primary)]">
              World Clocks
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Compare live global timezones against {primaryZoneMeta.city}
            </p>
          </div>

          {availableCitiesToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                aria-label="Select a city timezone to add"
                value={cityToAdd}
                onChange={(e) => setCityToAdd(e.target.value)}
                className="ff-input text-xs py-2 px-3 min-h-[40px] min-w-[200px]"
              >
                <option value="">Add a global city...</option>
                {availableCitiesToAdd.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.city} ({city.region})
                  </option>
                ))}
              </select>
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => handleAddWorldClock(cityToAdd)}
                disabled={!cityToAdd}
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </ThemeButton>
            </div>
          )}
        </div>

        {worldClocks.length === 0 ? (
          <ThemeCard className="p-8 text-center">
            <p className="text-sm text-[var(--ff-text-muted)]">
              No world clocks pinned yet. Choose a global city above to compare live timezones.
            </p>
          </ThemeCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {worldClocks.map((tzId) => {
              const parts = getZonedDateParts(nowDate, tzId);
              const meta = formatZoneDisplayName(tzId);
              const offsetMinutes = getTimezoneOffsetMinutes(nowDate, tzId);
              const deltaMinutes = offsetMinutes - primaryOffsetMinutes;

              const worldDayKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
              const relativeDay =
                worldDayKey === primaryDayKey
                  ? 'Today'
                  : worldDayKey > primaryDayKey
                    ? 'Tomorrow'
                    : 'Yesterday';

              let timeLabel = '';
              let periodLabel = '';
              if (hourFormat === '24h') {
                timeLabel = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
              } else {
                periodLabel = parts.hour >= 12 ? 'PM' : 'AM';
                const h12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
                timeLabel = `${String(h12).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
              }

              return (
                <ThemeCard key={tzId} className="p-4 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-[var(--ff-text-primary)] truncate">
                        {meta.city}
                      </h4>
                      <p className="text-xs text-[var(--ff-text-muted)] truncate">
                        {meta.region}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSwapPrimary(tzId)}
                        className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] hover:bg-[var(--ff-surface-subtle)] transition-colors min-w-[34px] min-h-[34px] flex items-center justify-center"
                        title={`Set ${meta.city} as primary clock`}
                        aria-label={`Set ${meta.city} as primary clock`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveWorldClock(tzId)}
                        className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] hover:bg-[var(--ff-surface-subtle)] transition-colors min-w-[34px] min-h-[34px] flex items-center justify-center"
                        title={`Remove ${meta.city}`}
                        aria-label={`Remove ${meta.city}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono tabular-nums text-2xl sm:text-3xl font-extrabold text-[var(--ff-text-primary)] leading-none">
                      {timeLabel}
                    </span>
                    <span className="font-mono tabular-nums text-xs text-[var(--ff-text-muted)]">
                      :{String(parts.second).padStart(2, '0')}
                    </span>
                    {periodLabel && (
                      <span className="font-mono text-xs font-bold text-[var(--ff-accent-text)] ml-0.5">
                        {periodLabel}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[var(--ff-text-secondary)] font-mono tabular-nums pt-2 border-t border-[var(--ff-border-color)]">
                    {relativeDay} · {formatDeltaFromPrimary(deltaMinutes)} · {formatUtcOffset(offsetMinutes)}
                  </p>
                </ThemeCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
