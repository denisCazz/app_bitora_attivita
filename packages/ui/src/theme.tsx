import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { darkPalette, motion, palette, radius, shiftHue, space, type, withAlpha } from "./tokens";

export interface Theme {
  dark: boolean;
  colors: {
    ink: string;
    inkSoft: string;
    paper: string;
    paperRaised: string;
    line: string;
    glass: string;
    glassSolid: string;
    glassFlat: string;
    glassBorder: string;
    field: string;
    accent: string;
    accentSoft: string;
    accentAlt: string;
    accentInk: string;
    danger: string;
    warning: string;
    success: string;
    info: string;
  };
  backdrop: readonly [string, string];
  aurora: readonly [string, string, string];
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  motion: typeof motion;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  accent = palette.ember,
  scheme: forced,
  children,
}: {
  accent?: string;
  scheme?: "light" | "dark";
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme = forced ?? system;
  const theme = useMemo<Theme>(() => {
    const dark = scheme === "dark";
    const base = dark ? darkPalette : palette;
    const accentAlt = shiftHue(accent, 38, dark ? 0.05 : 0.08);
    return {
      dark,
      colors: {
        ink: base.ink,
        inkSoft: base.inkSoft,
        paper: base.paper,
        paperRaised: base.paperRaised,
        line: base.line,
        glass: base.glass,
        glassSolid: base.glassSolid,
        glassFlat: base.glassFlat,
        glassBorder: base.glassBorder,
        field: base.field,
        accent,
        accentSoft: withAlpha(accent, dark ? 0.22 : 0.14),
        accentAlt,
        accentInk: "#FFFFFF",
        danger: base.danger,
        warning: base.warning,
        success: base.success,
        info: base.info,
      },
      backdrop: base.backdrop,
      aurora: [accent, accentAlt, shiftHue(accent, -52, dark ? 0 : 0.12)],
      space,
      radius,
      type,
      motion,
    };
  }, [accent, scheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme va usato dentro ThemeProvider");
  return theme;
}
