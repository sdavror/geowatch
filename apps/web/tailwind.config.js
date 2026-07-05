/** @type {import('tailwindcss').Config} */

// Helper for CSS-variable-backed colors with alpha-channel support
// (e.g. `bg-text-primary/50`). Tailwind calls this with the requested
// opacity value, which we forward into rgb()'s alpha slot.
function withOpacity(variableName) {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(${variableName}))`
      : `rgb(var(${variableName}) / ${opacityValue})`;
}

const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class', // toggled via a `dark`/`light` class on <html>, see ThemeProvider
  theme: {
    extend: {
      fontFamily: {
        // Wired to next/font CSS variables set on <html> in layout.tsx.
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
        serif: ['var(--font-lora)', 'Georgia', ...defaultTheme.fontFamily.serif],
      },
      colors: {
        bg: {
          DEFAULT: withOpacity('--color-bg'),
          2: withOpacity('--color-bg-2'),
          3: withOpacity('--color-bg-3'),
          4: withOpacity('--color-bg-4'),
        },
        text: {
          primary: withOpacity('--color-text-primary'),
          secondary: withOpacity('--color-text-secondary'),
          tertiary: withOpacity('--color-text-tertiary'),
        },
        // Status colors are intentionally plain hex, NOT theme variables —
        // these are semaphore signals (conflict/crisis/etc.) that must mean
        // the same thing in light and dark mode, unlike brand decoration.
        status: {
          conflict: '#e84545',
          crisis: '#f28c2a',
          unstable: '#f5c542',
          stable: '#3ecf8e',
        },
        // Brand color (lavender) DOES adapt between themes — see globals.css
        brand: {
          DEFAULT: withOpacity('--color-brand'),
          text: withOpacity('--color-brand-text'),
          bg: withOpacity('--color-brand-bg'),
        },
        accent: { blue: '#4a9eff', purple: '#a78bfa' },
      },
      borderColor: {
        border: withOpacity('--color-border'),
      },
    },
  },
  plugins: [],
};
