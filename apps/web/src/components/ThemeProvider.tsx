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
// this is what actually prevents the flash, not the React state. Written
// as a plain string (not a function) so it survives being embedded as
// dangerouslySetInnerHTML without any bundler transforms touching it.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (theme === 'light') document.documentElement.classList.add('light');
  } catch (e) {}
})();
`;

function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Must start as 'dark' here, matching the server-rendered default,
  // even though THEME_INIT_SCRIPT may have already set the .light class
  // on <html> before this runs. Reading the DOM directly in this initial
  // render would mismatch what the server produced for this same render
  // pass, which is the actual cause of hydration warnings — the *page
  // background* doesn't depend on this value (CSS reads the class
  // directly), only the toggle button's icon does, and that catches up
  // via the effect below on the very next tick.
  const [theme, setTheme] = useState<Theme>('dark');
  const isFirstRun = useRef(true);

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  useEffect(() => {
    // Skip the very first run: at that point `theme` is still the SSR
    // default ('dark'), not the real value THEME_INIT_SCRIPT already
    // applied to the DOM. Writing it here would briefly undo that script's
    // work before the effect above corrects `theme` a tick later.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    document.documentElement.classList.toggle('light', theme === 'light');
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
