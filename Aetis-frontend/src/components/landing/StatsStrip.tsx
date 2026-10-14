import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";

interface Stat {
  label: string;
  /** A number counts up on scroll; a string is shown as written */
  value: number | string;
  prefix?: string;
  suffix?: string;
  tone: string;
}

/**
 * These describe how AETIS is designed, not measured results. Replace them
 * with real figures from your pilot or deployment once you have them.
 */
const STATS: Stat[] = [
  { value: 3, label: "Emergency services coordinated", tone: "text-[var(--color-teal-600)]" },
  { value: 6, label: "Verified user roles", tone: "text-[var(--color-clay-500)]" },
  { value: 60, prefix: "+", suffix: "s", label: "Default signal buffer before arrival", tone: "text-[var(--color-sand-600)]" },
  { value: "24/7", label: "Live monitoring of every vehicle", tone: "text-[var(--color-olive-600)]" },
];

const reveal = (reduce: boolean | null, delay = 0): MotionProps =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-40px" },
        transition: { duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] },
      };

function CountUp({
  to,
  prefix = "",
  suffix = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setN(to);
      return;
    }

    const duration = 1200;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, to]);

  return (
    <>
      <span className="sr-only">
        {prefix}
        {to}
        {suffix}
      </span>
      <span ref={ref} aria-hidden>
        {prefix}
        {n}
        {suffix}
      </span>
    </>
  );
}

function StatsStrip() {
  const reduce = useReducedMotion();

  return (
    <div className="container-aetis">
      <h2 className="sr-only">Built for emergency response</h2>

      <dl className="card grid divide-y divide-[var(--border-subtle)] overflow-hidden sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            {...reveal(reduce, i * 0.07)}
            className="px-6 py-7 text-center"
          >
            <dd
              className={`font-[var(--font-display)] text-4xl font-extrabold ${s.tone}`}
            >
              {typeof s.value === "number" ? (
                <CountUp to={s.value} prefix={s.prefix} suffix={s.suffix} />
              ) : (
                s.value
              )}
            </dd>
            <dt className="mt-1.5 text-sm text-[var(--text-secondary)]">
              {s.label}
            </dt>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

export default StatsStrip;