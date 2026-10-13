/**
 * AETIS design tokens for use in TypeScript
 * (Tailwind config, Framer Motion, charts, map markers).
 * Keep in sync with variables.css.
 */

export const palette = {
  teal: {
    50: "#e8f1f4",
    100: "#c5dce4",
    200: "#9bc1cf",
    300: "#6aa0b3",
    400: "#3d7e96",
    500: "#1b5a73",
    600: "#0d3b4e", // Deep Teal
    700: "#0a2f3f",
    800: "#072330",
    900: "#041822",
  },
  clay: {
    50: "#fbeeea",
    100: "#f5d4cb",
    200: "#ecaf9f",
    300: "#e08b75",
    400: "#d4725a",
    500: "#c85a3e", // Terracotta Clay
    600: "#a94830",
    700: "#863825",
    800: "#63291b",
    900: "#411b12",
  },
  sand: {
    50: "#faf6f0",
    100: "#f4ecdf",
    200: "#e6d7c3", // Sand Beige
    300: "#d6c1a5",
    400: "#c3a884",
    500: "#a98c66",
    600: "#876f4e",
  },
  olive: {
    50: "#eef1e9",
    100: "#d7ddcb",
    200: "#b7c2a2",
    300: "#93a276",
    400: "#748657",
    500: "#5a6b44", // Olive Green
    600: "#485636",
    700: "#384328",
    800: "#28301c",
    900: "#191e11",
  },
} as const;

export const brand = {
  deepTeal: palette.teal[600],
  terracotta: palette.clay[500],
  sandBeige: palette.sand[200],
  oliveGreen: palette.olive[500],
} as const;

export const semantic = {
  background: {
    app: palette.sand[50],
    surface: "#ffffff",
    muted: palette.sand[100],
    sand: palette.sand[200],
    inverse: palette.teal[600],
    inverseDeep: palette.teal[800],
  },
  text: {
    primary: palette.teal[800],
    secondary: "#4a5f69",
    muted: "#7a8a92",
    inverse: palette.sand[50],
    inverseMuted: "#b9c9d0",
    accent: palette.clay[500],
  },
  border: {
    subtle: "rgba(13, 59, 78, 0.10)",
    default: "rgba(13, 59, 78, 0.18)",
    strong: "rgba(13, 59, 78, 0.32)",
    inverse: "rgba(230, 215, 195, 0.18)",
  },
  feedback: {
    success: palette.olive[500],
    warning: "#c98a2e",
    danger: palette.clay[600],
    info: palette.teal[500],
  },
} as const;

/** Emergency severity, used by SeverityBadge and map markers */
export const severityColors = {
  critical: palette.clay[600],
  high: palette.clay[500],
  medium: "#c98a2e",
  low: palette.olive[500],
} as const;

/** Vehicle lifecycle status, used by VehicleStatusBadge and EVMarker */
export const vehicleStatusColors = {
  available: palette.olive[500],
  dispatched: "#c98a2e",
  enRoute: palette.clay[500],
  arrived: palette.teal[500],
  offline: "#7a8a92",
} as const;

/** Traffic signal state, used by SignalStatusCard and the map */
export const signalStatusColors = {
  normal: palette.olive[500],
  priority: palette.clay[500],
  pending: "#c98a2e",
  fault: "#7a8a92",
} as const;

export const typography = {
  fontFamily: {
    sans: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    display:
      '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    "6xl": "3.75rem",
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.55,
  },
} as const;

export const spacing = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
  "2xl": "28px",
  full: "9999px",
} as const;

export const shadows = {
  xs: "0 1px 2px rgba(13, 59, 78, 0.06)",
  sm: "0 2px 6px rgba(13, 59, 78, 0.08)",
  md: "0 6px 16px rgba(13, 59, 78, 0.10)",
  lg: "0 12px 32px rgba(13, 59, 78, 0.14)",
  xl: "0 24px 56px rgba(13, 59, 78, 0.18)",
  focus: "0 0 0 3px rgba(200, 90, 62, 0.35)",
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const layout = {
  containerMax: "1240px",
  sidebarWidth: 256,
  sidebarWidthCollapsed: 76,
  topbarHeight: 68,
} as const;

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  sidebar: 1200,
  topbar: 1300,
  modalBackdrop: 1400,
  modal: 1500,
  toast: 1600,
  tooltip: 1700,
} as const;

/** Motion tokens: durations in seconds for Framer Motion */
export const motion = {
  duration: {
    fast: 0.12,
    base: 0.22,
    slow: 0.4,
  },
  ease: {
    standard: [0.4, 0, 0.2, 1],
    out: [0.16, 1, 0.3, 1],
    inOut: [0.65, 0, 0.35, 1],
  },
} as const;

export const theme = {
  palette,
  brand,
  semantic,
  severityColors,
  vehicleStatusColors,
  signalStatusColors,
  typography,
  spacing,
  radius,
  shadows,
  breakpoints,
  layout,
  zIndex,
  motion,
} as const;

export type Theme = typeof theme;
export type SeverityLevel = keyof typeof severityColors;
export type VehicleStatus = keyof typeof vehicleStatusColors;
export type SignalStatus = keyof typeof signalStatusColors;

export default theme;