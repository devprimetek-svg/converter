/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pure: {
          black: '#000000',
          dark: '#09090b',
          surface: '#121214',
          card: '#18181b',
          border: '#27272a',
          muted: '#71717a',
          light: '#f4f4f5',
          white: '#ffffff',
        },
        yamaha: {
          50: '#f0f4f9',
          100: '#d9e2ef',
          500: '#1b365d',
          600: '#142947',
          700: '#0f1f36',
          800: '#0a1525',
          900: '#060d17',
          red: '#D6001C',
        },
      },
      boxShadow: {
        'glow-white': '0 0 25px -5px rgba(255, 255, 255, 0.2)',
        'glow-white-sm': '0 0 10px 0 rgba(255, 255, 255, 0.15)',
      },
      animation: {
        'gauge-pulse': 'gaugePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'telemetry-scan': 'telemetryScan 3s linear infinite',
      },
      keyframes: {
        gaugePulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        },
        telemetryScan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' },
        },
      },
    },
  },
  plugins: [],
}
