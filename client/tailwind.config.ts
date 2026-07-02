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
          DEFAULT: '#f5b02a',
          hover: '#e8a020',
          light: 'rgba(245,176,42,0.12)',
          glow: 'rgba(245,176,42,0.35)',
          foreground: '#000000',
        },
        // Keep accent for compatibility
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          light: 'rgba(59,130,246,0.10)',
        },
        sidebar: {
          bg: 'transparent',
          border: 'rgba(255,255,255,0.08)',
          text: '#94a3b8',
          'text-active': '#f5b02a',
          hover: 'rgba(255,255,255,0.06)',
          active: '#f5b02a',
          'active-bg': 'rgba(245,176,42,0.10)',
          'group-label': 'rgba(148,163,184,0.5)',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.03)',
          alt: 'rgba(255,255,255,0.04)',
          elevated: 'rgba(22,28,48,0.97)',
          hover: 'rgba(255,255,255,0.06)',
        },
        ink: {
          DEFAULT: '#f8fafc',
          secondary: '#94a3b8',
          muted: 'rgba(148,163,184,0.6)',
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.14)',
        },
        // Semantic — keep names but remap to dark variants
        success: '#10b981',
        warning: '#f5b02a',
        error: '#ef4444',
        info: '#3b82f6',
      },
      boxShadow: {
        card: '0 8px 32px 0 rgba(0,0,0,0.37)',
        'card-hover': '0 12px 40px rgba(0,0,0,0.4)',
        modal: '-12px 0 60px rgba(0,0,0,0.6)',
        dropdown: '0 8px 24px -4px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(245,176,42,0.35)',
        'glow-btn': '0 4px 15px rgba(245,176,42,0.4)',
      },
      borderRadius: {
        'xl': '20px',
        '2xl': '24px',
        '3xl': '28px',
      },
      fontFamily: {
        sans: ['"DM Sans"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backdropBlur: {
        glass: '16px',
        'glass-sm': '12px',
        'glass-lg': '32px',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
