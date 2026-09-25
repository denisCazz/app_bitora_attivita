export const palette = {
  ink: "#121318",
  inkSoft: "#5C606C",
  paper: "#EEF0F4",
  paperRaised: "#FFFFFF",
  line: "rgba(18,19,24,0.08)",
  glass: "rgba(255,255,255,0.52)",
  glassSolid: "rgba(255,255,255,0.86)",
  glassFlat: "rgba(255,255,255,0.94)",
  glassBorder: "rgba(255,255,255,0.9)",
  field: "rgba(255,255,255,0.62)",
  backdrop: ["#F7F5F1", "#ECEEF4"] as const,
  ember: "#E25B2A",
  pine: "#1C6B56",
  danger: "#D92D20",
  warning: "#DC6803",
  success: "#079455",
  info: "#1570EF",
  white: "#FFFFFF",
  black: "#0B0C10",
} as const;

export const darkPalette = {
  ink: "#F5F6F8",
  inkSoft: "#A0A4AF",
  paper: "#08090C",
  paperRaised: "#17191F",
  line: "rgba(255,255,255,0.08)",
  glass: "rgba(24,26,33,0.46)",
  glassSolid: "rgba(26,28,35,0.9)",
  glassFlat: "rgba(22,24,31,0.94)",
  glassBorder: "rgba(255,255,255,0.12)",
  field: "rgba(255,255,255,0.06)",
  backdrop: ["#0A0B0F", "#121420"] as const,
  ember: "#FF7A45",
  pine: "#3DDC97",
  danger: "#FF8A80",
  warning: "#F5C16C",
  success: "#6EE7B7",
  info: "#93C5FD",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" as const, letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, letterSpacing: 0.2 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
} as const;

export const FLOATING_TAB_SPACE = 96;
export const FAB_CLEARANCE = 84;

export const motion = {
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  enter: 260,
  stagger: 35,
  maxStagger: 5,
} as const;

function hexToHsl(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function shiftHue(hex: string, degrees: number, lightness = 0): string {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})/i.test(hex)) return hex;
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + degrees + 360) % 360, s, Math.min(0.85, Math.max(0.15, l + lightness)));
}

export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}
