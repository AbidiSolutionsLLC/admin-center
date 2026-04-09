import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E8870A',
          50: '#FEF3E2',   // Lightest shade
          100: '#FDE6C4',  // Very light
          200: '#FCD9A6',  // Light
          300: '#FACC88',  // Medium-light
          400: '#F9BF6A',  // Medium
          500: '#F8B24C',  // Medium-dark
          600: '#E8870A',  // DEFAULT (main brand color)
          700: '#C97208',  // hover state
          800: '#AA5D06',  // Darker
          900: '#8B4805',  // Darkest
          hover: '#C97208',
          light: '#FEF3E2',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          light: '#EEF2FF',
          foreground: '#FFFFFF',
        },
        sidebar: {
          bg: '#0F1629',
          border: '#1E2A42',
          text: '#8B95AA',
          'text-active': '#FFFFFF',
          hover: '#1A2540',
          active: '#E8870A',
          'active-bg': '#1E2A42',
          'group-label': '#4A566E',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          base: '#F7F8FA',    // Page background (light cool gray)
          alt: '#F1F3F7',     // Alternate rows, hover states, modal footers
          secondary: '#F1F3F7', // Alias for backwards compatibility
          elevated: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#0F1629',
          primary: '#0F1629', // Alias for consistency
          secondary: '#5A6478',
          muted: '#9BA5B7',
          red: '#DC2626', // For critical/error states (alias of error.DEFAULT)
        },
        skeleton: '#EDF0F5',  // Loading skeleton background
        line: {
          DEFAULT: '#E2E6ED',
          strong: '#C8CDD8',
        },
        // Semantic states from guidelines
        success: {
          DEFAULT: '#059669',
          light: '#ECFDF5',
          border: '#6EE7B7',
        },
        warning: {
          DEFAULT: '#D97706',
          light: '#FFFBEB',
          border: '#FCD34D',
        },
        error: {
          DEFAULT: '#DC2626',
          light: '#FEF2F2',
          border: '#FCA5A5',
        },
        info: {
          DEFAULT: '#0284C7',
          light: '#F0F9FF',
          border: '#7DD3FC',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 22, 41, 0.06), 0 1px 2px -1px rgba(15, 22, 41, 0.04)',
        'card-hover': '0 4px 12px 0 rgba(15, 22, 41, 0.10)',
        modal: '0 20px 60px -10px rgba(15, 22, 41, 0.25)',
        dropdown: '0 8px 24px -4px rgba(15, 22, 41, 0.14)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '11': ['11px', { lineHeight: '16px' }],
        '13': ['13px', { lineHeight: '20px' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
