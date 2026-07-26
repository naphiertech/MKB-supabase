import { useRef, useEffect } from 'react';
import type { Variants } from 'framer-motion';

/**
 * Enterprise Motion System Primitives
 * Built according to design engineering principles:
 * - Event-driven motion (plays on route load, user triggers, modal open/close)
 * - Silent background polling & refetches (no re-fading or re-staggering)
 * - Snappy springs (stiffness 350-420, damping 28-32, mass 0.7)
 * - Under 250ms feel for high perceived speed
 * - Hardware-accelerated GPU transforms (opacity + transform)
 */

/**
 * Hook to track whether a component is rendering for the first time.
 * Used to ensure entrance animations play ONCE on mount / route navigation,
 * but remain silent during background polling and data refetches.
 */
export function useIsFirstRender(): boolean {
  const isFirst = useRef(true);
  useEffect(() => {
    isFirst.current = false;
  }, []);
  return isFirst.current;
}

// Core Spring Presets
export const SPRINGS = {
  snappy: {
    type: 'spring' as const,
    stiffness: 380,
    damping: 30,
    mass: 0.7,
  },
  gentle: {
    type: 'spring' as const,
    stiffness: 280,
    damping: 26,
    mass: 0.8,
  },
  modal: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 32,
    mass: 0.7,
  },
  popover: {
    type: 'spring' as const,
    stiffness: 450,
    damping: 30,
    mass: 0.6,
  },
};

// Page Transition Variants (App.tsx)
export const PAGE_TRANSITION_VARIANTS: Variants = {
  initial: {
    opacity: 0,
    scale: 0.99,
    y: 6,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRINGS.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.995,
    y: -3,
    transition: {
      duration: 0.12,
      ease: [0.23, 1, 0.32, 1], // Custom strong ease-out
    },
  },
};

// Modal Backdrop & Dialog Variants
export const MODAL_BACKDROP_VARIANTS: Variants = {
  initial: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
  },
  animate: {
    opacity: 1,
    backdropFilter: 'blur(4px)',
    transition: {
      duration: 0.18,
      ease: [0.23, 1, 0.32, 1],
    },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: {
      duration: 0.14,
      ease: [0.23, 1, 0.32, 1],
    },
  },
};

export const MODAL_CONTENT_VARIANTS: Variants = {
  initial: {
    opacity: 0,
    scale: 0.96,
    y: 8,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRINGS.modal,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 4,
    transition: {
      duration: 0.12,
      ease: [0.23, 1, 0.32, 1],
    },
  },
};

// Dropdown & Popover Variants
export const DROPDOWN_VARIANTS: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: -6,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRINGS.popover,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: {
      duration: 0.1,
      ease: [0.23, 1, 0.32, 1],
    },
  },
};

// Data Table / List Cascading Stagger Variants
export const STAGGER_CONTAINER_VARIANTS: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.01,
    },
  },
};

export const STAGGER_ITEM_VARIANTS: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: SPRINGS.snappy,
  },
};

// Interactive Micro-Interaction Press Props
export const BUTTON_TAP_PROPS = {
  whileTap: { scale: 0.97 },
  whileHover: { scale: 1.015 },
  transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
};

export const CARD_TAP_PROPS = {
  whileTap: { scale: 0.985 },
  whileHover: { y: -2 },
  transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
};
