import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import {
  BarChart3,
  Check,
  History,
  LayoutDashboard,
  MapPinned,
  Settings,
  TrafficCone,
} from "lucide-react";

const NAV_ICONS = [
  { icon: LayoutDashboard, active: true },
  { icon: MapPinned, active: false },
  { icon: TrafficCone, active: false },
  { icon: History, active: false },
  { icon: BarChart3, active: false },
  { icon: Settings, active: false },
] as const;

/** Sample figures for the preview only. They are not live data. */
const TILES = [
  { value: "12", label: "Active emergencies", tone: "bg-[var(--color-clay-600)] text-white" },
  { value: "7 min", label: "Avg. response", tone: "bg-[var(--color-sand-200)] text-[var(--color-teal-800)]" },
  { value: "38", label: "Signals cleared", tone: "bg-[var(--color-olive-500)] text-white" },
  { value: "24", label: "Units on road", tone: "bg-[var(--color-teal-500)] text-white" },
] as const;

const INCIDENTS = [
  { title: "AMB-07 to City Hospital", place: "NH-24, Ghaziabad", eta: "ETA 4 min", level: "High", dot: "bg-[var(--color-clay-500)]" },
  { title: "FIRE-02 to scene", place: "Delhi-Meerut Expressway", eta: "ETA 6 min", level: "Medium", dot: "bg-[var(--feedback-warning)]" },
  { title: "PCR-11 to scene", place: "Sector 62, Noida", eta: "ETA 9 min", level: "Low", dot: "bg-[var(--color-olive-500)]" },
] as const;

const BENEFITS = [
  { label: "Live vehicle tracking", tone: "bg-[var(--color-clay-500)]" },
  { label: "Priority-based alerts", tone: "bg-[var(--color-sand-500)]" },
  { label: "Signal status along each route", tone: "bg-[var(--color-teal-500)]" },
  { label: "Response-time analytics", tone: "bg-[var(--color-olive-500)]" },
] as const;

const reveal = (reduce: boolean | null, delay = 0): MotionProps =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
        transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
      };

function MiniMap({ animate }: { animate: boolean }) {
  return (
    <svg
      viewBox="0 0 400 240"
      role="img"
      aria-label="Sample map showing a vehicle route with traffic signals along it"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="400" height="240" fill="#072330" />

      {/* Street grid */}
      <g stroke="#1b5a73" strokeWidth="1.5" opacity="0.7" fill="none">
        <path d="M0 60 H400 M0 130 H400 M0 195 H400" />
        <path d="M70 0 V240 M170 0 V240 M270 0 V240 M350 0 V240" />
        <path d="M0 210 L140 120 L300 40 L400 10" strokeWidth="2.5" />
      </g>

      {/* Route */}
      <path
        d="M40 195 H170 V130 H270 V60 H350"
        fill="none"
        stroke="#c85a3e"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Signals */}
      <g fill="#5a6b44" stroke="#faf6f0" strokeWidth="2">
        <circle cx="170" cy="162" r="7" />
        <circle cx="270" cy="95" r="7" />
      </g>
      <circle cx="350" cy="60" r="7" fill="#c85a3e" stroke="#faf6f0" strokeWidth="2" />

      {/* Vehicle */}
      <circle cx="120" cy="195" r="7" fill="#faf6f0" stroke="#c85a3e" strokeWidth="3">
        {animate && (
          <>
            <animate attributeName="cx" values="60;170" dur="3.5s" repeatCount="indefinite" />
          </>
        )}
      </circle>
      <circle cx="120" cy="195" r="7" fill="none" stroke="#c85a3e" strokeWidth="2">
        {animate && (
          <>
            <animate attributeName="cx" values="60;170" dur="3.5s" repeatCount="indefinite" />
            <animate attributeName="r" values="7;20" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
          </>
        )}
      </circle>
    </svg>
  );
}

function LiveDashboardPreview() {
  const reduce = useReducedMotion();

  return (
    <div className="container-aetis grid items-stretch gap-8 lg:grid-cols-[1.7fr_1fr]">
      {/* ---------- Dashboard mock ---------- */}
      <motion.div
        {...reveal(reduce)}
        className="card-dark overflow-hidden"
        role="group"
        aria-label="Preview of the AETIS dispatcher dashboard with sample data"
      >
        <div className="flex">
          <div
            aria-hidden
            className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-[var(--border-inverse)] py-4 sm:flex"
          >
            {NAV_ICONS.map(({ icon: Icon, active }, i) => (
              <span
                key={i}
                className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] ${
                  active
                    ? "bg-[var(--color-clay-500)] text-white"
                    : "text-[var(--text-inverse-muted)]"
                }`}
              >
                <Icon size={18} />
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base text-[var(--text-inverse)]">
                Live incident overview
              </h3>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-sand-200)]">
                Sample data
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {TILES.map((t) => (
                <div key={t.label} className={`rounded-[var(--radius-md)] px-3 py-2.5 ${t.tone}`}>
                  <p className="font-[var(--font-display)] text-xl font-extrabold leading-none">
                    {t.value}
                  </p>
                  <p className="mt-1 text-[11px] opacity-90">{t.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_1fr]">
              <div className="h-48 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-inverse)] md:h-auto md:min-h-[220px]">
                <MiniMap animate={!reduce} />
              </div>

              <ul className="space-y-2">
                {INCIDENTS.map((inc) => (
                  <li
                    key={inc.title}
                    className="rounded-[var(--radius-md)] bg-white/5 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-[var(--text-inverse)]">
                        {inc.title}
                      </p>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-[var(--text-inverse-muted)]">
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${inc.dot}`} />
                        {inc.level}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-inverse-muted)]">
                      {inc.place} &middot; {inc.eta}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---------- Copy ---------- */}
      <motion.div
        {...reveal(reduce, 0.1)}
        className="card-sand flex flex-col justify-center p-6 sm:p-8"
      >
        <span className="eyebrow self-start">Real-time view</span>
        <h2 className="mt-4 text-3xl sm:text-4xl">
          One view for{" "}
          <span className="text-gradient-brand">every emergency vehicle</span>
        </h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Dispatchers see every active vehicle, its route, its ETA and the
          signals ahead of it on a single screen, so nothing depends on a phone
          call.
        </p>

        <ul className="mt-6 space-y-3">
          {BENEFITS.map((b) => (
            <li key={b.label} className="flex items-center gap-3 text-sm font-semibold">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${b.tone}`}
              >
                <Check size={14} />
              </span>
              {b.label}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

export default LiveDashboardPreview;