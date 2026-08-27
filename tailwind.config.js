/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ===== Neutral surface & border scale (light theme only) =====
        // NOTE: key names are kept identical to the old dark-theme scale
        // (950/900/850/800/700/600) so every existing className in the app
        // ("bg-base-800", "border-base-700", etc.) repaints automatically —
        // no JSX changes needed. Values below are new, light-appropriate.
        base: {
          950: '#F5F8FC', // page background (very soft blue-white)
          900: '#EFF3F9', // subtle alt background / hover fill
          850: '#FFFFFF', // pure white surface (cards)
          800: '#F3F6FB', // soft fill for rows / chips
          700: '#E4E9F2', // default border / divider
          600: '#D3DAE6', // slightly stronger border
        },
        // ===== Neutral text scale =====
        // Same trick as above: low numbers were used throughout the app as
        // "bright" text on a dark theme, so on this light theme they map to
        // dark, high-contrast text instead. Mid numbers are secondary text.
        gray: {
          50: '#FFFFFF',
          100: '#0F1B2D', // primary text / headings (darkest)
          200: '#16233A',
          300: '#33415A', // standard body text
          400: '#5C6B85', // secondary / muted text
          500: '#5C6B85',
          600: '#475569', // tertiary / muted text (icons, captions)
          700: '#33415A',
          800: '#16233A',
          900: '#0F1B2D',
        },
        // ===== Brand: Sky Blue (primary) =====
        // NOTE: 300/400 are used across the app as *text* colors (e.g.
        // "text-accent-400" on ids/labels) — this pattern came from the
        // dark-theme original, where bright blue text worked on a black
        // card. On this light theme, text needs to be a *dark* saturated
        // blue to stay readable on white, so 300/400 are deliberately
        // deeper than 200/500 rather than following a strict light→dark
        // ramp. Use 50/100/200 for tinted backgrounds and 500 for the
        // literal brand swatch (buttons, icon fills, borders).
        accent: {
          50: '#EEF7FF',
          100: '#DBEEFF',
          200: '#B8E0FF',
          300: '#1B5798', // text on light bg
          400: '#1E6FC4', // text on light bg
          500: '#4DA6FF', // brand sky blue (spec color)
          600: '#2E8AE6',
          700: '#1E6FC4',
          800: '#1B5798',
          900: '#183F6B',
        },
        // ===== Brand: Lavender (secondary) =====
        // The old "blue" token (used for volume bars, medium-priority tags,
        // secondary chart series) is remapped to lavender so the app
        // automatically gains its two-tone sky+lavender identity.
        blue: {
          400: '#7F49A6', // text on light bg (see accent note above)
          500: '#B57EDC', // brand lavender (spec color)
          600: '#9A5FC4',
        },
        lavender: {
          50: '#FAF5FD',
          100: '#F1E1FA',
          200: '#E1C4F0',
          300: '#CDA3E8',
          400: '#C08EE0',
          500: '#B57EDC', // brand lavender
          600: '#9A5FC4',
          700: '#7F49A6',
          800: '#623684',
          900: '#452561',
        },
        // ===== Status semantics (kept conventional; not brand colors) =====
        success: {
          50: '#F0FDF4',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#15803D', // text on light bg (verified 4.5:1+ contrast)
          500: '#166534',
          600: '#14532D',
        },
        warning: {
          50: '#FFFBEB',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#B45309',
          500: '#92400E',
          600: '#78350F',
        },
        error: {
          50: '#FEF2F2',
          200: '#FECACA',
          300: '#991B1B', // text on light bg (see accent note above)
          400: '#DC2626',
          500: '#B91C1C',
          600: '#991B1B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 27, 45, 0.04), 0 1px 8px rgba(15, 27, 45, 0.04)',
        'card-hover': '0 8px 24px rgba(20, 60, 130, 0.10), 0 2px 6px rgba(20, 60, 130, 0.06)',
        nav: '0 1px 0 rgba(15, 27, 45, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
