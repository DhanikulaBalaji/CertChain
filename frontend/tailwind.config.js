/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  // Disable preflight to avoid conflicting with Bootstrap base styles
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
        accent:    { DEFAULT: '#a78bfa', cyan: '#06b6d4' },
        glass:     { DEFAULT: 'rgba(30,27,60,0.75)', light: 'rgba(255,255,255,0.06)' },
        surface:   { DEFAULT: '#1e1b3a', 2: '#2d2b55', 3: '#13112a' },
        success:   '#10b981',
        danger:    '#ef4444',
        warning:   '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'dark-base':  'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        'card-grad':  'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))',
        'hero-grad':  'linear-gradient(135deg, #6366f1 0%, #a78bfa 50%, #06b6d4 100%)',
        'green-grad': 'linear-gradient(135deg, #059669, #10b981)',
        'red-grad':   'linear-gradient(135deg, #dc2626, #ef4444)',
      },
      backdropBlur: { xs: '4px' },
      boxShadow: {
        glow:    '0 0 30px rgba(99,102,241,0.3)',
        'glow-sm': '0 0 14px rgba(99,102,241,0.25)',
        card:    '0 8px 32px rgba(0,0,0,0.4)',
        input:   '0 0 0 3px rgba(99,102,241,0.2)',
      },
      animation: {
        'fade-in':   'fadeIn 0.5s ease-out',
        'slide-up':  'slideUp 0.4s ease-out',
        'pulse-glow':'pulseGlow 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 },                to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 10px rgba(99,102,241,0.3)' }, '50%': { boxShadow: '0 0 30px rgba(99,102,241,0.6)' } },
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.5rem' },
    },
  },
  plugins: [],
};
