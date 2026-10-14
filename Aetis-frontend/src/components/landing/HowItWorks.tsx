import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";

const STEPS = [
  {
    title: "Call received",
    description:
      "A caller dials 108, 100 or 101. The dispatcher opens AETIS and records the location and situation.",
    tone: "bg-[var(--color-teal-600)]",
  },
  {
    title: "Dispatch and route",
    description:
      "The nearest available vehicle is assigned and AETIS builds the fastest route to the scene and the destination.",
    tone: "bg-[var(--color-clay-500)]",
  },
  {
    title: "Destination alerted",
    description:
      "The hospital, police or fire station receives the details and live ETA to prepare in advance.",
    tone: "bg-[var(--color-sand-500)]",
  },
  {
    title: "Signals cleared",
    description:
      "Signals ahead open in time for the vehicle and return to normal as soon as cameras confirm it has passed.",
    tone: "bg-[var(--color-olive-500)]",
  },
] as const;

const reveal = (reduce: boolean | null, delay = 0): MotionProps =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
        transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] },
      };

function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <div className="container-aetis">
      <div className="card-sand p-6 sm:p-10">
        <motion.div {...reveal(reduce)}>
          <h2 className="text-3xl sm:text-4xl">
            How <span className="text-gradient-brand">AETIS</span> Works
          </h2>
          <p className="mt-2 max-w-xl text-base text-[var(--text-secondary)]">
            From the first call to a clear road, in four steps.
          </p>
        </motion.div>

        <ol className="relative mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {/* Dashed connector behind the numbered circles (desktop only) */}
          <div
            aria-hidden
            className="absolute left-[8%] right-[8%] top-5 hidden border-t-2 border-dashed border-[var(--color-clay-300)] lg:block"
          />

          {STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              {...reveal(reduce, i * 0.1)}
              className="relative"
            >
              <span
                aria-hidden
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-white ring-4 ring-[var(--bg-surface-muted)] ${step.tone}`}
              >
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {step.description}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default HowItWorks;