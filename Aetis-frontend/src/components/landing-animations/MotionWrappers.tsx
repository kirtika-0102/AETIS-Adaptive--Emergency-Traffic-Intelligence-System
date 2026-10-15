import type { ElementType, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps, Variants } from "framer-motion";

/* ==========================================================================
   Shared scroll-reveal animation for AETIS public pages.

   - <Reveal>       fades and slides one block in when it scrolls into view
   - <Stagger>      a group whose <StaggerItem> children appear one after another
   - revealProps()  the same effect as plain props, for elements that are
                    already motion.* components

   All of it switches itself off (content is simply visible) when the visitor
   prefers reduced motion, or the browser has no IntersectionObserver. Hidden
   content can never get stuck invisible.
   ========================================================================== */

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export type RevealDirection = "up" | "down" | "left" | "right" | "none";
export type RevealTag = "div" | "section" | "article" | "ul" | "ol" | "li";

export interface RevealOptions {
  /** Where the content slides in from. Default "up". */
  direction?: RevealDirection;
  /** Slide distance in px. Default 20. */
  distance?: number;
  /** Seconds to wait before starting. Default 0. */
  delay?: number;
  /** Seconds the animation lasts. Default 0.45. */
  duration?: number;
  /** Start from this scale (e.g. 0.96) and settle at 1. Omit for no scaling. */
  scale?: number;
  /** Play only the first time it is seen. Default true. */
  once?: boolean;
  /** Fraction of the element (0 to 1) that must be visible to trigger. */
  amount?: number;
  /** Trigger this far inside the viewport edge. Default "-60px". */
  margin?: string;
}

const TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
} as const;

/** Whether scroll animations should run at all */
export function useMotionEnabled(): boolean {
  const reduce = useReducedMotion();
  return !reduce && typeof IntersectionObserver !== "undefined";
}

function offsetFor(direction: RevealDirection, distance: number) {
  switch (direction) {
    case "up":
      return { y: distance };
    case "down":
      return { y: -distance };
    case "left":
      return { x: distance };
    case "right":
      return { x: -distance };
    default:
      return {};
  }
}

/**
 * Reveal-on-scroll as plain props. Spread onto an existing motion.* element.
 * Pass `enabled` from useMotionEnabled(); when false it returns no props.
 */
export function revealProps(
  enabled: boolean,
  options: RevealOptions = {}
): MotionProps {
  if (!enabled) return {};

  const {
    direction = "up",
    distance = 20,
    delay = 0,
    duration = 0.45,
    scale,
    once = true,
    amount,
    margin = "-60px",
  } = options;

  const hasScale = scale !== undefined;

  return {
    initial: {
      opacity: 0,
      ...offsetFor(direction, distance),
      ...(hasScale ? { scale } : {}),
    },
    whileInView: {
      opacity: 1,
      x: 0,
      y: 0,
      ...(hasScale ? { scale: 1 } : {}),
    },
    viewport: { once, amount, margin },
    transition: { duration, delay, ease: EASE_OUT },
  };
}

/* ---------- Reveal ---------- */

export interface RevealProps extends RevealOptions {
  children: ReactNode;
  /** Element to render. Default "div". */
  as?: RevealTag;
  className?: string;
  id?: string;
}

export function Reveal({
  children,
  as = "div",
  className,
  id,
  ...options
}: RevealProps) {
  const enabled = useMotionEnabled();
  const Tag = TAGS[as] as ElementType;

  return (
    <Tag id={id} className={className} {...revealProps(enabled, options)}>
      {children}
    </Tag>
  );
}

/* ---------- Stagger ---------- */

export interface StaggerProps {
  children: ReactNode;
  as?: RevealTag;
  className?: string;
  id?: string;
  /** Seconds between one child starting and the next. Default 0.08. */
  stagger?: number;
  /** Seconds before the first child starts. Default 0. */
  delay?: number;
  once?: boolean;
  amount?: number;
  margin?: string;
}

/**
 * Wrap a group, and put <StaggerItem> around each child. The group watches
 * the viewport once; its children then appear in sequence.
 */
export function Stagger({
  children,
  as = "div",
  className,
  id,
  stagger = 0.08,
  delay = 0,
  once = true,
  amount,
  margin = "-60px",
}: StaggerProps) {
  const enabled = useMotionEnabled();
  const Tag = TAGS[as] as ElementType;

  if (!enabled) {
    return (
      <Tag id={id} className={className}>
        {children}
      </Tag>
    );
  }

  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };

  return (
    <Tag
      id={id}
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount, margin }}
    >
      {children}
    </Tag>
  );
}

export interface StaggerItemProps {
  children: ReactNode;
  as?: RevealTag;
  className?: string;
  /** Slide distance in px. Default 20. */
  distance?: number;
  duration?: number;
}

/** A child of <Stagger>. On its own, outside a <Stagger>, it is just visible. */
export function StaggerItem({
  children,
  as = "div",
  className,
  distance = 20,
  duration = 0.45,
}: StaggerItemProps) {
  const enabled = useMotionEnabled();
  const Tag = TAGS[as] as ElementType;

  if (!enabled) {
    return <Tag className={className}>{children}</Tag>;
  }

  const variants: Variants = {
    hidden: { opacity: 0, y: distance },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration, ease: EASE_OUT },
    },
  };

  return (
    <Tag className={className} variants={variants}>
      {children}
    </Tag>
  );
}