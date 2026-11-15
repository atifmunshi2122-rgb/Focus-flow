import React, { useMemo } from 'react';

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

