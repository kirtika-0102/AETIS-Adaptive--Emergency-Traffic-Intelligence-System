import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import { BellRing, Route, ShieldCheck, TrafficCone } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    tone: "bg-[var(--color-teal-600)]",
    title: "Verified dispatch",
    description:
      "Only verified dispatchers and drivers can sign in, so every request and every vehicle is accountable.",
  },
  {
    icon: Route,
    tone: "bg-[var(--color-clay-500)]",
    title: "Fastest route and ETA",
    description:
      "The quickest path to the scene and on to the hospital, with a live arrival estimate at every signal.",
  },
  {
    icon: BellRing,
    tone: "bg-[var(--color-sand-500)]",
    title: "Early destination alerts",
    description:
      "Hospitals, police and fire stations receive the details and ETA before the vehicle arrives.",
  },
  {
    icon: TrafficCone,
    tone: "bg-[var(--color-olive-500)]",
    title: "Signal priority",
    description:
      "Cameras spot the approaching vehicle and signals open ahead of it, then return to normal.",
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

function FeatureCards() {
  const reduce = useReducedMotion();

  return (
    <div className="container-aetis">
      <h2 className="sr-only">Features</h2>

      <ul className="card grid divide-y divide-[var(--border-subtle)] overflow-hidden sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {FEATURES.map(({ icon: Icon, tone, title, description }, i) => (
          <motion.li
            key={title}
            {...reveal(reduce, i * 0.08)}
            className="p-6 text-center sm:p-7"
          >
            <span
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white ${tone}`}
            >
              <Icon size={26} aria-hidden />
            </span>
            <h3 className="mt-4 text-lg">{title}</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export default FeatureCards;