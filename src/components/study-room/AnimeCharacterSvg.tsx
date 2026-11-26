/**
 * FocusFlow & Finance — Shared Anime Character SVG Renderer
 *
 * Ensures the exact same anime character identity (hairstyle, hair color,
 * eye color, skin tone, outfit & ribbon) is maintained across Mode 1 (Isometric Lounge)
 * and Mode 2 (3D Pods), matching Mode 3 (360° Study Room GLB avatars).
 */

import React from 'react';
import type { StudyActivity, StudyAvatarIdentity } from '../../lib/studyAvatarRegistry.ts';

interface AnimeCharacterSvgProps {
  identity: StudyAvatarIdentity;
  isLive: boolean;
  activity: StudyActivity;
  variant?: 'seated' | 'bust';
  className?: string;
}

export const AnimeCharacterSvg: React.FC<AnimeCharacterSvgProps> = ({
  identity,
  isLive,
  activity,
  variant = 'seated',
  className = '',
}) => {
  const isFemale = identity.style === 'female';

  if (variant === 'bust') {
    return (
      <svg
        viewBox="0 0 64 64"
        className={className}
        role="img"
        aria-label={`${identity.label} anime avatar`}
      >
        <defs>
          <linearGradient id={`bg-${identity.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={identity.outfitPrimary} stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="14" fill={`url(#bg-${identity.id})`} />

        {/* Back hair / Ponytail */}
        {isFemale ? (
          <>
            <path d="M16 26 C14 42, 18 52, 24 54 L40 54 C46 52, 50 42, 48 26 Z" fill={identity.hairColor} />
            <ellipse cx="47" cy="30" rx="6" ry="12" transform="rotate(14 47 30)" fill={identity.hairHighlight} />
            {identity.ribbonColor && (
              <circle cx="44" cy="21" r="3.2" fill={identity.ribbonColor} />
            )}
          </>
        ) : (
          <path d="M17 24 C17 12, 47 12, 47 24 L45 34 L19 34 Z" fill={identity.hairColor} />
        )}

        {/* Shoulders & Modern Outfit */}
        <path
          d="M12 64 C13 48, 22 44, 32 44 C42 44, 51 48, 52 64 Z"
          fill={identity.outfitPrimary}
        />
        <path d="M25 44 L32 54 L39 44 Z" fill={identity.outfitSecondary} />

        {/* Neck */}
        <rect x="28" y="37" width="8" height="9" rx="3" fill={identity.skinTone} />

        {/* Sculpted Anime Face */}
        <path
          d="M19 25 C19 14, 45 14, 45 25 C45 35, 38 41, 32 41 C26 41, 19 35, 19 25 Z"
          fill={identity.skinTone}
        />

        {/* Expressive Anime Eyes */}
        <g>
          {/* Left Eye */}
          <ellipse cx="26" cy="28" rx="3.2" ry="3.8" fill="#ffffff" />
          <ellipse cx="26.2" cy="28.3" rx="2.3" ry="3.0" fill={identity.eyeColor} />
          <circle cx="26.2" cy="28.5" r="1.2" fill="#0f172a" />
          <circle cx="25.2" cy="27.0" r="0.9" fill="#ffffff" />
          <path d="M22.5 24.8 Q26 23.2 29.3 25.0" stroke="#1e1b2e" strokeWidth="1.3" fill="none" strokeLinecap="round" />

          {/* Right Eye */}
          <ellipse cx="38" cy="28" rx="3.2" ry="3.8" fill="#ffffff" />
          <ellipse cx="37.8" cy="28.3" rx="2.3" ry="3.0" fill={identity.eyeColor} />
          <circle cx="37.8" cy="28.5" r="1.2" fill="#0f172a" />
          <circle cx="36.8" cy="27.0" r="0.9" fill="#ffffff" />
          <path d="M34.7 25.0 Q38 23.2 41.5 24.8" stroke="#1e1b2e" strokeWidth="1.3" fill="none" strokeLinecap="round" />

          {/* Soft Blush & Smile */}
          <ellipse cx="22.5" cy="32.2" rx="2.3" ry="1.1" fill="#fda4af" opacity="0.55" />
          <ellipse cx="41.5" cy="32.2" rx="2.3" ry="1.1" fill="#fda4af" opacity="0.55" />
          <path d="M29.8 35.2 Q32 36.8 34.2 35.2" stroke="#7c4a46" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </g>

        {/* Layered Anime Bangs */}
        {isFemale ? (
          <path
            d="M17 25 C17 11, 47 11, 47 25 L44 21 L40 25 L35 19 L31 25 L26 19 L21 25 Z"
            fill={identity.hairColor}
          />
        ) : (
          <path
            d="M17 24 C17 10, 47 10, 47 24 L43 18 L39 24 L33 17 L28 25 L23 19 L19 24 Z"
            fill={identity.hairColor}
          />
        )}

        {/* Accessories (Glasses / Headphones) */}
        {identity.accessories?.includes('glasses') && (
          <g stroke="#e2e8f0" strokeWidth="1.2" fill="none">
            <rect x="21.5" y="24" width="9" height="7" rx="2.5" fill="rgba(56,189,248,0.12)" />
            <rect x="33.5" y="24" width="9" height="7" rx="2.5" fill="rgba(56,189,248,0.12)" />
            <line x1="30.5" y1="27" x2="33.5" y2="27" />
          </g>
        )}
        {identity.accessories?.includes('headphones') && (
          <g>
            <path d="M16 26 C16 9, 48 9, 48 26" stroke="#334155" strokeWidth="2.8" fill="none" />
            <rect x="13" y="23" width="4.5" height="9" rx="2" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
            <rect x="46.5" y="23" width="4.5" height="9" rx="2" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
          </g>
        )}

        {/* Activity micro-badge (Book / Laptop / Pen indicator) */}
        {isLive && (
          <circle cx="53" cy="11" r="4.5" fill="#ef4444" stroke="#0f172a" strokeWidth="1.5">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    );
  }

  // Seated Isometric Lounge Character
  return (
    <g transform="translate(0, 10)">
      {/* Chair Backrest */}
      <rect x="-14" y="4" width="28" height="17" rx="6" fill="#1e293b" stroke="#475569" strokeWidth="1" />

      {/* Back Hair / Ponytail */}
      {isFemale && (
        <>
          <ellipse cx="10" cy="-12" rx="4.5" ry="9" transform="rotate(-18 10 -12)" fill={identity.hairHighlight} />
          {identity.ribbonColor && <circle cx="8" cy="-19" r="2.2" fill={identity.ribbonColor} />}
        </>
      )}

      {/* Torso & Outfit */}
      <path
        d="M-12 10 C-12 -3, -8 -7, 0 -7 C8 -7, 12 -3, 12 10 Z"
        fill={identity.outfitPrimary}
        stroke="#0f172a"
        strokeWidth="1.2"
      />
      {/* Collar / Shirt */}
      <polygon points="-4,-7 0,-1 4,-7" fill={identity.outfitSecondary} />

      {/* Arms reaching toward desk (animated slightly when typing/writing) */}
      <path
        d={
          activity === 'typing' || activity === 'writing'
            ? 'M-11 -1 L-15 -7 L-7 -9'
            : 'M-11 0 L-13 -5 L-6 -7'
        }
        stroke={identity.outfitPrimary}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={
          activity === 'typing' || activity === 'writing'
            ? 'M11 -1 L15 -7 L7 -9'
            : 'M11 0 L13 -5 L6 -7'
        }
        stroke={identity.outfitPrimary}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Neck & Sculpted Anime Head */}
      <rect x="-2.5" y="-11" width="5" height="5" rx="2" fill={identity.skinTone} />
      <path
        d="M-9.5 -19 C-9.5 -28, 9.5 -28, 9.5 -19 C9.5 -12, 5 -8.5, 0 -8.5 C-5 -8.5, -9.5 -12, -9.5 -19 Z"
        fill={identity.skinTone}
        stroke="#0f172a"
        strokeWidth="0.9"
      />

      {/* Anime Eyes */}
      <ellipse cx="-3.6" cy="-16.5" rx="1.8" ry="2.2" fill="#ffffff" />
      <circle cx="-3.5" cy="-16.3" r="1.3" fill={identity.eyeColor} />
      <circle cx="-4.0" cy="-17.0" r="0.5" fill="#ffffff" />

      <ellipse cx="3.6" cy="-16.5" rx="1.8" ry="2.2" fill="#ffffff" />
      <circle cx="3.5" cy="-16.3" r="1.3" fill={identity.eyeColor} />
      <circle cx="3.0" cy="-17.0" r="0.5" fill="#ffffff" />

      {/* Layered Anime Hair & Bangs */}
      <path
        d={
          isFemale
            ? 'M-10.5 -18 C-10.5 -29, 10.5 -29, 10.5 -18 L8 -21 L5 -17.5 L1 -22 L-2 -17.5 L-6 -21 Z'
            : 'M-10.5 -19 C-10.5 -29.5, 10.5 -29.5, 10.5 -19 L7.5 -23 L4 -18.5 L0 -23.5 L-4 -18 L-7.5 -22 Z'
        }
        fill={identity.hairColor}
      />

      {/* Accessories (Glasses / Headphones) */}
      {identity.accessories?.includes('glasses') && (
        <g stroke="#e2e8f0" strokeWidth="0.9" fill="none">
          <rect x="-6.4" y="-19" width="5.2" height="4.4" rx="1.4" fill="rgba(56,189,248,0.14)" />
          <rect x="1.2" y="-19" width="5.2" height="4.4" rx="1.4" fill="rgba(56,189,248,0.14)" />
          <line x1="-1.2" y1="-17" x2="1.2" y2="-17" />
        </g>
      )}
      {identity.accessories?.includes('headphones') && (
        <g>
          <path d="M-10.5 -18 C-10.5 -30, 10.5 -30, 10.5 -18" stroke="#334155" strokeWidth="2" fill="none" />
          <rect x="-12" y="-20" width="2.8" height="5.5" rx="1.2" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.7" />
          <rect x="9.2" y="-20" width="2.8" height="5.5" rx="1.2" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.7" />
        </g>
      )}

      {/* Red Blinking LIVE Dot */}
      {isLive && (
        <circle cx="12" cy="-25" r="4.2" fill="#ef4444" stroke="#0f172a" strokeWidth="1.5">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.15s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
};

