import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { theme } from "../styles/theme";
import type { Theme } from "../styles/theme";

const ThemeContext = createContext<Theme | null>(null);

/**
 * Makes the design tokens from styles/theme.ts available through useTheme().
 *
 * AETIS has one light theme. There is no mode switch, because dark colours
 * have not been designed. When they are, this is the place to add one.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside <ThemeProvider>.");
  }
  return value;
}