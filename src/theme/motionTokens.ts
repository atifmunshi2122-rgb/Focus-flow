/**
 * FocusFlow & Finance — Centralized Motion & Animation Design System
 *
 * Unified motion language across the entire application:
 * - Deterministic duration tokens (micro, control, overlay, modal, card, page, celebration)
 * - Calibrated easing curves and physics springs (mechanical, damped, fluid, snappy, gentle)
 * - Cross-module variant factories (fade, scale-fade, slide-up, modal, drawer, accordion)
 * - Strict accessibility compliance: prefers-reduced-motion & animationIntensity overrides
 * - GPU-optimized: targets transform & opacity to guarantee 60fps without layout thrashing
 */

import type { Transition, Variants } from 'motion/react';
import type { AnimationIntensity, DesignStyleId } from '../types/theme.ts';

// 1. Duration Tokens (seconds)
export const MOTION_DURATION = {
  instant: 0,
  micro: 0.14,      // 100-150ms: checkbox check, button tap, icon micro-rotation
  control: 0.18,    // 150-200ms: toggle switch, tab slider, small pills
  dropdown: 0.18,   // 150-220ms: dropdown menus, floating tooltips
  overlay: 0.22,    // 200-250ms: backdrop scrim, sheet backdrop
  modal: 0.26,      // 220-300ms: modal dialog scale-fade
  card: 0.28,       // 250-320ms: card expand, module accordion
  drawer: 0.3,      // 250-350ms: mobile sidebar, drawer slide
  page: 0.3,        // 250-350ms: global page / tab transitions
  celebration: 0.55 // 500-600ms: milestone burst, confetti, success celebration
} as const;

// 2. Easing Curves
export const MOTION_EASING = {
  // Apple / iOS-style natural deceleration
  natural: [0.22, 1, 0.36, 1] as const,
  // High-performance smooth deceleration
  decelerate: [0.16, 1, 0.3, 1] as const,
  // Gentle continuous motion
  gentle: [0.25, 0.1, 0.25, 1] as const,
  // Standard CSS-friendly ease
  standard: [0.25, 0.1, 0.25, 1] as const,
  // Clean accelerating exit
  exit: [0.4, 0, 1, 1] as const,
  // Sharp interaction response
  sharp: [0.4, 0, 0.2, 1] as const,
  // Smooth step
  smoothStep: [0.33, 1, 0.68, 1] as const,

  // Spring Physics Presets
  springSnappy: { type: 'spring', stiffness: 440, damping: 32, mass: 0.9 } as const,
  springSoft: { type: 'spring', stiffness: 320, damping: 28, mass: 1 } as const,
  springExpressive: { type: 'spring', stiffness: 380, damping: 22, mass: 0.85 } as const,
  springApple: { type: 'spring', stiffness: 410, damping: 30, mass: 0.85 } as const,
  springLinear: { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const,
  springMechanical: { type: 'spring', stiffness: 640, damping: 44, mass: 0.7 } as const,
  springBouncy: { type: 'spring', stiffness: 350, damping: 18, mass: 0.8 } as const,
  springInteractive: { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 } as const,
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

/**
 * Maps design style archetype to physical animation dynamics family.
 */
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

/**
 * Computes an adaptive motion profile respecting active design style and reduced motion.
 */
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

/**
 * Smooth, restrained global page transition variants.
 * Guarantees zero layout jumps and instant response under reduced-motion.
 */
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
      ? 3
      : intensity === 'subtle'
      ? 4
      : intensity === 'expressive'
      ? 10
      : 6;
  const duration =
    family === 'mechanical'
      ? 0.16
      : intensity === 'subtle'
      ? 0.18
      : intensity === 'expressive'
      ? 0.3
      : 0.22;

  return {
    initial: { opacity: 0, y: yOffset },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration,
        ease: MOTION_EASING.decelerate,
      },
    },
    exit: {
      opacity: 0,
      y: -Math.max(2, Math.round(yOffset * 0.4)),
      transition: {
        duration: Math.min(0.12, duration * 0.5),
        ease: MOTION_EASING.exit,
      },
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

/**
 * Stagger variants for parent containers and children.
 */
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
      ? 0.045
      : 0.03;
  const yOffset =
    family === 'mechanical'
      ? 3
      : intensity === 'subtle'
      ? 4
      : intensity === 'expressive'
      ? 10
      : 6;
  const duration =
    family === 'mechanical'
      ? 0.15
      : intensity === 'subtle'
      ? 0.18
      : intensity === 'expressive'
      ? 0.28
      : 0.22;

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

/**
 * Standard Fade Transition Variants
 */
export function getFadeVariants(
  intensity: AnimationIntensity = 'standard',
  reducedMotion = false
): Variants {
  if (intensity === 'none' || reducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  return {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: { duration: MOTION_DURATION.control, ease: MOTION_EASING.decelerate },
    },
    exit: {
      opacity: 0,
      transition: { duration: MOTION_DURATION.micro, ease: MOTION_EASING.exit },
    },
  };
}

/**
 * Standard Scale-Fade Transition Variants (for modals, popovers, context menus)
 */
export function getScaleFadeVariants(
  intensity: AnimationIntensity = 'standard',
  reducedMotion = false
): Variants {
  if (intensity === 'none' || reducedMotion) {
    return {
      initial: { opacity: 1, scale: 1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 1, scale: 1 },
    };
  }
  const scaleFrom = intensity === 'expressive' ? 0.94 : 0.97;
  return {
    initial: { opacity: 0, scale: scaleFrom },
    animate: {
      opacity: 1,
      scale: 1,
      transition: { duration: MOTION_DURATION.modal, ease: MOTION_EASING.natural },
    },
    exit: {
      opacity: 0,
      scale: scaleFrom,
      transition: { duration: MOTION_DURATION.control, ease: MOTION_EASING.exit },
    },
  };
}

/**
 * Slide-Up Transition Variants (for toast notifications, action sheets, bottom drawers)
 */
export function getSlideUpVariants(
  intensity: AnimationIntensity = 'standard',
  reducedMotion = false
): Variants {
  if (intensity === 'none' || reducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 16 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: MOTION_DURATION.card, ease: MOTION_EASING.decelerate },
    },
    exit: {
      opacity: 0,
      y: 12,
      transition: { duration: MOTION_DURATION.control, ease: MOTION_EASING.exit },
    },
  };
}

/**
 * Accordion Expand/Collapse Variants (for subtask checklists, module details)
 */
export function getAccordionVariants(
  intensity: AnimationIntensity = 'standard',
  reducedMotion = false
): Variants {
  if (intensity === 'none' || reducedMotion) {
    return {
      collapsed: { height: 0, opacity: 0 },
      expanded: { height: 'auto', opacity: 1 },
    };
  }
  return {
    collapsed: {
      height: 0,
      opacity: 0,
      transition: { duration: MOTION_DURATION.control, ease: MOTION_EASING.exit },
    },
    expanded: {
      height: 'auto',
      opacity: 1,
      transition: { duration: MOTION_DURATION.card, ease: MOTION_EASING.natural },
    },
  };
}
