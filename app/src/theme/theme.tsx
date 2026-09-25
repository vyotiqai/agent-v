import { createContext, type ReactNode, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { type Colors, colors, shadows, type ThemeName } from './tokens.ts';

/**
 * The theme follows the phone's appearance unless the person picks Light or Dark (D69). Every
 * component reads its colours from here, never from a hex value of its own (D71).
 */
export interface Theme {
  name: ThemeName;
  colors: Colors;
  shadows: (typeof shadows)[ThemeName];
}

const themes: Record<ThemeName, Theme> = {
  light: { name: 'light', colors: colors.light, shadows: shadows.light },
  dark: { name: 'dark', colors: colors.dark, shadows: shadows.dark },
};

const ThemeContext = createContext<Theme>(themes.light);

export function ThemeProvider({
  appearance = 'phone',
  children,
}: {
  /** 'phone' follows the phone's setting; 'light' or 'dark' is the person's own choice (D69). */
  appearance?: 'phone' | ThemeName;
  children: ReactNode;
}) {
  const phone = useColorScheme();
  const name: ThemeName =
    appearance === 'phone' ? (phone === 'dark' ? 'dark' : 'light') : appearance;
  return <ThemeContext value={themes[name]}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
