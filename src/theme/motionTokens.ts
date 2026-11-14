import type { Transition, Variants } from 'motion/react';
import type { AnimationIntensity, DesignStyleId } from '../types/theme.ts';

export const MOTION_EASING = {
  natural: [0.22, 1, 0.36, 1] as const,
  decelerate: [0.16, 1, 0.3, 1] as const,
  gentle: [0.25, 0.1, 0.25, 1] as const,
  standard: [0.25, 0.1, 0.25, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  springSnappy: { type: 'spring', stiffness: 440, damping: 32, mass: 0.9 } as const,
  springSoft: { type: 'spring', stiffness: 320, damping: 28, mass: 1 } as const,
  springExpressive: { type: 'spring', stiffness: 380, damping: 22, mass: 0.85 } as const,
  springApple: { type: 'spring', stiffness: 410, damping: 30, mass: 0.85 } as const,
  springLinear: { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const,
  springMechanical: { type: 'spring', stiffness: 640, damping: 44, mass: 0.7 } as const,
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

export type StylePhysicsFamily = 'mechanical' | 'damped' | 'fluid';

export interface ThemeMotionProfile {
  family: StylePhysicsFamily;
  spring: Transition;
  microSpring: Transition;
  listLayout: Transition;
  modal: Transition;
  hoverLiftPx: number;
  tapScale: number;
  allowOvershoot: boolean;
}

export function getStylePhysicsFamily(styleId?: DesignStyleId): StylePhysicsFamily {
  if (!styleId) return 'fluid';
  if (styleId === 'brutalism' || styleId === 'retro') return 'mechanical';
  if (
    styleId === 'minimalism' ||
    styleId === 'editorial' ||
    styleId === 'flat' ||
    styleId === 'oled'
  ) {
    return 'damped';
  }
  return 'fluid';
}

export function getThemeMotionProfile(
  styleId: DesignStyleId | undefined,
  intensity: AnimationIntensity,
  reducedMotion: boolean
): ThemeMotionProfile {
  if (intensity === 'none' || reducedMotion) {
    const instant: Transition = { duration: 0 };
    return {
      family: 'damped',
      spring: instant,
      microSpring: instant,
      listLayout: instant,
      modal: instant,
      hoverLiftPx: 0,
      tapScale: 1,
      allowOvershoot: false,
    };
  }

  const family = getStylePhysicsFamily(styleId);

  if (family === 'mechanical') {
    const crisp: Transition =
      intensity === 'subtle'
        ? { duration: 0.11, ease: [0.2, 0, 0, 1] }
        : MOTION_EASING.springMechanical;
    return {
      family,
      spring: crisp,
      microSpring: { duration: 0.1, ease: [0.2, 0, 0, 1] },
      listLayout: { duration: 0.16, ease: [0.2, 0, 0, 1] },
      modal: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
      hoverLiftPx: intensity === 'subtle' ? 0 : -1,
      tapScale: 0.985,
      allowOvershoot: false,
    };
  }

  if (family === 'damped') {
    const linearSpring: Transition =
      intensity === 'subtle'
        ? { duration: 0.18, ease: MOTION_EASING.decelerate }
        : MOTION_EASING.springLinear;
    return {
      family,
      spring: linearSpring,
      microSpring: { duration: 0.14, ease: MOTION_EASING.decelerate },
      listLayout: { type: 'spring', stiffness: 460, damping: 38, mass: 0.85 },
      modal: { duration: 0.2, ease: MOTION_EASING.decelerate },
      hoverLiftPx: intensity === 'subtle' ? 0 : -1.5,
      tapScale: 0.98,
      allowOvershoot: false,
    };
  }

  // Fluid Apple / Linear spring family
  if (intensity === 'subtle') {
    return {
      family,
      spring: { duration: 0.18, ease: MOTION_EASING.decelerate },
      microSpring: { duration: 0.14, ease: MOTION_EASING.decelerate },
      listLayout: { duration: 0.2, ease: MOTION_EASING.decelerate },
      modal: { duration: 0.18, ease: MOTION_EASING.decelerate },
      hoverLiftPx: -1,
      tapScale: 0.985,
      allowOvershoot: false,
    };
  }

  if (intensity === 'expressive') {
    return {
      family,
      spring: MOTION_EASING.springExpressive,
      microSpring: { type: 'spring', stiffness: 520, damping: 26, mass: 0.75 },
      listLayout: { type: 'spring', stiffness: 400, damping: 26, mass: 0.85 },
      modal: { type: 'spring', stiffness: 380, damping: 26, mass: 0.85 },
      hoverLiftPx: -3,
      tapScale: 0.96,
      allowOvershoot: true,
    };
  }

  return {
    family,
    spring: MOTION_EASING.springApple,
    microSpring: { type: 'spring', stiffness: 500, damping: 32, mass: 0.8 },
    listLayout: { type: 'spring', stiffness: 430, damping: 32, mass: 0.85 },
    modal: { type: 'spring', stiffness: 420, damping: 32, mass: 0.85 },
    hoverLiftPx: -2,
    tapScale: 0.97,
    allowOvershoot: true,
  };
}

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

export function getPageTransition(
  intensity: AnimationIntensity,
  reducedMotion: boolean,
  styleId?: DesignStyleId
): Variants {
  if (intensity === 'none' || reducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  const family = getStylePhysicsFamily(styleId);
  const yOffset =
    family === 'mechanical'
      ? 4
      : intensity === 'subtle'
      ? 5
      : intensity === 'expressive'
      ? 12
      : 8;
  const duration =
    family === 'mechanical'
      ? 0.16
      : intensity === 'subtle'
      ? 0.18
      : intensity === 'expressive'
      ? 0.3
      : 0.24;

  return {
    initial: { opacity: 0, y: yOffset },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration, ease: MOTION_EASING.decelerate },
    },
    exit: {
      opacity: 0,
      y: -Math.max(2, Math.round(yOffset * 0.45)),
      transition: { duration: Math.min(0.14, duration * 0.5), ease: MOTION_EASING.exit },
    },
  };
}

export function getSpringTransition(
  intensity: AnimationIntensity,
  reducedMotion: boolean,
  styleId?: DesignStyleId
): Transition {
  if (styleId) {
    return getThemeMotionProfile(styleId, intensity, reducedMotion).spring;
  }
  if (intensity === 'none' || reducedMotion) {
    return { duration: 0 };
  }
  if (intensity === 'subtle') {
    return { duration: 0.18, ease: MOTION_EASING.natural };
  }
  if (intensity === 'expressive') {
    return MOTION_EASING.springExpressive;
  }
  return MOTION_EASING.springApple;
}

export function getStaggerVariants(
  intensity: AnimationIntensity,
  reducedMotion: boolean,
  styleId?: DesignStyleId
): {
  container: Variants;
  item: Variants;
} {
  if (intensity === 'none' || reducedMotion) {
    return {
      container: { hidden: {}, show: {} },
      item: { hidden: { opacity: 1 }, show: { opacity: 1 } },
    };
  }
  const family = getStylePhysicsFamily(styleId);
  const stagger =
    family === 'mechanical'
      ? 0.015
      : intensity === 'subtle'
      ? 0.02
      : intensity === 'expressive'
      ? 0.05
      : 0.032;
  const yOffset =
    family === 'mechanical'
      ? 4
      : intensity === 'subtle'
      ? 5
      : intensity === 'expressive'
      ? 12
      : 8;
  const duration =
    family === 'mechanical'
      ? 0.15
      : intensity === 'subtle'
      ? 0.18
      : intensity === 'expressive'
      ? 0.3
      : 0.24;

  return {
    container: {
      hidden: {},
      show: {
        transition: {
          staggerChildren: stagger,
          delayChildren: 0.01,
        },
      },
    },
    item: {
      hidden: { opacity: 0, y: yOffset },
      show: {
        opacity: 1,
        y: 0,
        transition: { duration, ease: MOTION_EASING.decelerate },
      },
    },
  };
}
