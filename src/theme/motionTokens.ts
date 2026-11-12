import type { Transition, Variants } from 'motion/react';
import type { AnimationIntensity } from '../types/theme.ts';

export const MOTION_EASING = {
  natural: [0.22, 1, 0.36, 1] as const,
  decelerate: [0.22, 1, 0.36, 1] as const,
  gentle: [0.25, 0.1, 0.25, 1] as const,
  standard: [0.25, 0.1, 0.25, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  springSnappy: { type: 'spring', stiffness: 440, damping: 32, mass: 0.9 } as const,
  springSoft: { type: 'spring', stiffness: 320, damping: 28, mass: 1 } as const,
  springExpressive: { type: 'spring', stiffness: 380, damping: 22, mass: 0.85 } as const,
};

export const MOTION_DURATION = {
  micro: 0.14,     // 100-180ms
  control: 0.18,   // 120-220ms
  dropdown: 0.18,  // 150-250ms
  overlay: 0.22,   // 150-250ms
  card: 0.28,      // 200-350ms
  page: 0.32,      // 250-450ms
  celebration: 0.55,
};

export function getIntensityFactor(intensity: AnimationIntensity): number {
  switch (intensity) {
    case 'none':
      return 0;
    case 'subtle':
      return 0.65;
    case 'expressive':
      return 1.25;
    default:
      return 1;
  }
}

export function getPageTransition(intensity: AnimationIntensity, reducedMotion: boolean): Variants {
  if (intensity === 'none' || reducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  const yOffset = intensity === 'subtle' ? 5 : intensity === 'expressive' ? 14 : 9;
  const duration = intensity === 'subtle' ? 0.2 : intensity === 'expressive' ? 0.36 : MOTION_DURATION.page;
  return {
    initial: { opacity: 0, y: yOffset },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration, ease: MOTION_EASING.natural },
    },
    exit: {
      opacity: 0,
      y: -Math.round(yOffset * 0.5),
      transition: { duration: duration * 0.65, ease: MOTION_EASING.exit },
    },
  };
}

export function getSpringTransition(intensity: AnimationIntensity, reducedMotion: boolean): Transition {
  if (intensity === 'none' || reducedMotion) {
    return { duration: 0 };
  }
  if (intensity === 'subtle') {
    return { duration: 0.18, ease: MOTION_EASING.natural };
  }
  if (intensity === 'expressive') {
    return MOTION_EASING.springExpressive;
  }
  return MOTION_EASING.springSnappy;
}

export function getStaggerVariants(intensity: AnimationIntensity, reducedMotion: boolean): {
  container: Variants;
  item: Variants;
} {
  if (intensity === 'none' || reducedMotion) {
    return {
      container: { hidden: {}, show: {} },
      item: { hidden: { opacity: 1 }, show: { opacity: 1 } },
    };
  }
  const stagger = intensity === 'subtle' ? 0.025 : intensity === 'expressive' ? 0.06 : 0.04;
  const yOffset = intensity === 'subtle' ? 6 : intensity === 'expressive' ? 14 : 10;
  const duration = intensity === 'subtle' ? 0.2 : intensity === 'expressive' ? 0.34 : MOTION_DURATION.card;

  return {
    container: {
      hidden: {},
      show: {
        transition: {
          staggerChildren: stagger,
          delayChildren: 0.02,
        },
      },
    },
    item: {
      hidden: { opacity: 0, y: yOffset },
      show: {
        opacity: 1,
        y: 0,
        transition: { duration, ease: MOTION_EASING.natural },
      },
    },
  };
}
