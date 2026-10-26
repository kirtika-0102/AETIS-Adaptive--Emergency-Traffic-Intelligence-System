import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  LayoutDashboard,
  Siren,
  TrafficCone,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROUTES, getHomeRouteForRole } from "../../routes/routePaths";

const FACTS = [
  { value: "108 · 100 · 101", label: "Emergency lines supported" },
  { value: "Live ETA", label: "Route and arrival tracking" },
  { value: "24/7", label: "Real-time monitoring" },
] as const;

const STATUS_STEPS = [
  { icon: Siren, label: "Request received", tone: "bg-[var(--color-clay-500)]" },
  { icon: Truck, label: "Vehicle dispatched", tone: "bg-[var(--color-sand-500)]" },
  { icon: BellRing, label: "Hospital alerted", tone: "bg-[var(--color-olive-500)]" },
  { icon: TrafficCone, label: "Signals cleared", tone: "bg-[var(--color-teal-500)]" },
] as const;

const fadeUp = (reduce: boolean | null, delay = 0): MotionProps =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
      };

/** Stylised dusk road scene, drawn in code so no image file is needed */
function RoadScene() {
  return (
    <svg
      viewBox="0 0 640 480"
      role="img"
      aria-label="Illustration of an ambulance approaching a junction at dusk, outlined by a detection box"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d3b4e" />
          <stop offset="0.55" stopColor="#c85a3e" />
          <stop offset="1" stopColor="#e6d7c3" />
        </linearGradient>
      </defs>

      <rect width="640" height="480" fill="url(#hero-sky)" />
      <circle cx="470" cy="235" r="46" fill="#e6d7c3" opacity="0.55" />

      {/* Skyline */}
      <g fill="#072330" opacity="0.92">
        <rect x="10" y="190" width="40" height="100" />
        <rect x="58" y="150" width="36" height="140" />
        <rect x="100" y="200" width="50" height="90" />
        <rect x="160" y="170" width="34" height="120" />
        <rect x="200" y="215" width="40" height="75" />
        <rect x="430" y="180" width="40" height="110" />
        <rect x="478" y="140" width="34" height="150" />
        <rect x="520" y="195" width="48" height="95" />
        <rect x="576" y="160" width="44" height="130" />
        <rect x="626" y="205" width="30" height="85" />
      </g>

      {/* Road */}
      <polygon points="250,285 390,285 720,480 -80,480" fill="#0a2f3f" />
      <g fill="none" stroke="#e6d7c3" strokeLinecap="round">
        <line x1="250" y1="285" x2="-80" y2="480" strokeWidth="2" opacity="0.5" />
        <line x1="390" y1="285" x2="720" y2="480" strokeWidth="2" opacity="0.5" />
        <line x1="285" y1="285" x2="110" y2="480" strokeWidth="3" strokeDasharray="14 12" opacity="0.65" />
        <line x1="355" y1="285" x2="530" y2="480" strokeWidth="3" strokeDasharray="14 12" opacity="0.65" />
        <line x1="320" y1="285" x2="320" y2="480" strokeWidth="3" strokeDasharray="14 12" opacity="0.4" />
      </g>

      {/* Other traffic */}
      <g>
        <rect x="170" y="420" width="60" height="32" rx="6" fill="#041822" />
        <circle cx="180" cy="446" r="3" fill="#c85a3e" />
        <circle cx="220" cy="446" r="3" fill="#c85a3e" />
        <rect x="420" y="404" width="56" height="30" rx="6" fill="#041822" />
        <circle cx="430" cy="428" r="3" fill="#c85a3e" />
        <circle cx="466" cy="428" r="3" fill="#c85a3e" />
        <rect x="344" y="312" width="20" height="11" rx="3" fill="#041822" />
        <rect x="262" y="318" width="22" height="12" rx="3" fill="#041822" />
      </g>

      {/* Ambulance */}
      <g>
        <rect x="286" y="370" width="68" height="40" rx="6" fill="#faf6f0" />
        <rect x="286" y="388" width="68" height="7" fill="#c85a3e" />
        <rect x="294" y="376" width="52" height="9" rx="2" fill="#0d3b4e" opacity="0.85" />
        <rect x="308" y="363" width="24" height="7" rx="2" fill="#c85a3e" />
        <circle cx="298" cy="408" r="3.5" fill="#c85a3e" />
        <circle cx="342" cy="408" r="3.5" fill="#c85a3e" />
      </g>

      {/* Detection box */}
      <rect
        x="274"
        y="352"
        width="92"
        height="68"
        rx="4"
        fill="none"
        stroke="#e6d7c3"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
    </svg>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const { isAuthenticated, isLoading, user } = useAuth();

  const signedIn = !isLoading && isAuthenticated && user != null;
  const ctaTo = signedIn ? getHomeRouteForRole(user.role) : ROUTES.LOGIN;
  const ctaLabel = signedIn ? "Open dashboard" : "Explore AETIS";
  const CtaIcon = signedIn ? LayoutDashboard : ArrowRight;

  return (
    <div className="container-aetis grid items-center gap-12 pt-10 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
      {/* ---------- Copy ---------- */}
      <div>
        <motion.span {...fadeUp(reduce)} className="eyebrow">
          Emergency vehicle priority network
        </motion.span>

        <motion.h1
          {...fadeUp(reduce, 0.08)}
          className="mt-5 text-5xl leading-[1.05] text-[var(--text-primary)] sm:text-6xl"
        >
          Smarter Roads for{" "}
          <span className="text-gradient-brand">Safer Communities</span>
        </motion.h1>

        <motion.p
          {...fadeUp(reduce, 0.16)}
          className="mt-6 max-w-xl text-base text-[var(--text-secondary)] sm:text-lg"
        >
          AETIS connects dispatchers, ambulances, hospitals and traffic signals
          in one live system, so help reaches people faster and the road is
          already clear when it arrives.
        </motion.p>

        <motion.div
          {...fadeUp(reduce, 0.24)}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Link
            to={ctaTo}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-primary)] px-6 py-3.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)]"
          >
            {ctaLabel}
            <CtaIcon size={16} aria-hidden />
          </Link>
          <Link
            to={{ pathname: ROUTES.HOME, hash: "#how-it-works" }}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-clay-500)] px-6 py-3.5 text-sm font-semibold text-[var(--color-clay-600)] transition-colors hover:bg-[var(--color-clay-50)]"
          >
            See how it works
          </Link>
        </motion.div>

        <motion.dl
          {...fadeUp(reduce, 0.32)}
          className="mt-10 grid grid-cols-3 gap-4 border-t border-[var(--border-default)] pt-6"
        >
          {FACTS.map((f) => (
            <div key={f.label}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--color-clay-500)] sm:text-2xl">
                {f.value}
              </dd>
              <p aria-hidden className="mt-1 text-xs text-[var(--text-secondary)]">
                {f.label}
              </p>
            </div>
          ))}
        </motion.dl>
      </div>

      {/* ---------- Visual ---------- */}
      <motion.div
        {...(reduce
          ? {}
          : {
              initial: { opacity: 0, scale: 0.97 },
              animate: { opacity: 1, scale: 1 },
              transition: { duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] },
            })}
        className="relative"
      >
        <div
          aria-hidden
          className="absolute -right-4 -top-4 h-40 w-40 rounded-full bg-[var(--color-clay-500)] opacity-90"
        />
        <div
          aria-hidden
          className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-[var(--color-olive-500)] opacity-80"
        />

        <div className="relative aspect-[4/3.4] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] shadow-[shadow:var(--shadow-xl)]">
          <RoadScene />

          {/* Detection callout */}
          <div className="absolute left-3 top-3 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-inverse)] bg-[rgba(7,35,48,0.92)] px-3.5 py-3 text-[var(--text-inverse)] shadow-[shadow:var(--shadow-lg)] sm:left-5 sm:top-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-clay-500)]">
              <Siren size={20} aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight">
                Ambulance detected
              </span>
              <span className="block text-xs text-[var(--text-inverse-muted)]">
                Signal opening ahead
              </span>
            </span>
          </div>

          {/* Status list */}
          <ul
            aria-label="Response progress"
            className="absolute bottom-5 right-5 hidden w-52 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-inverse)] bg-[rgba(7,35,48,0.92)] text-[var(--text-inverse)] shadow-[shadow:var(--shadow-lg)] sm:block"
          >
            {STATUS_STEPS.map(({ icon: Icon, label, tone }) => (
              <li
                key={label}
                className="flex items-center gap-3 border-b border-[var(--border-inverse)] px-3.5 py-2.5 last:border-b-0"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <span className="text-xs font-semibold">{label}</span>
              </li>
            ))}
          </ul>

          <span className="absolute bottom-3 left-4 text-[10px] font-semibold uppercase tracking-wider text-[rgba(250,246,240,0.7)]">
            Illustration
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export default Hero;