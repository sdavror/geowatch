'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'geowatch-theme';

// Inlined into <head> via the script below, so it runs before first paint —
// this is what actually prevents the flash, not the React state. Light is
// the default premium editorial theme; dark is opt-in and applied via the
// `.dark` class only when the user has explicitly chosen it before.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem('${STORAGE_KEY}') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Must start as 'light' here, matching the server-rendered default
  // (which emits no theme class). THEME_INIT_SCRIPT may already have added
  // `.dark` before this runs; the effect below syncs `theme` to the real
  // DOM state a tick later. The page background reads the class directly,
  // so only the toggle icon depends on this value.
  const [theme, setTheme] = useState<Theme>('light');
  const isFirstRun = useRef(true);

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
