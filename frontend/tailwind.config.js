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
        carbon: {
          950: '#07090e',
          900: '#0b0f19',
          850: '#0e1626',
          800: '#141e33',
          700: '#1e293b',
          600: '#334155',
        },
        cockpit: {
          cyan: '#00f0ff',
          neon: '#06b6d4',
          amber: '#f59e0b',
          flame: '#ea580c',
          emerald: '#10b981',
          titanium: '#273549',
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
        'glow-cyan': '0 0 25px -5px rgba(0, 240, 255, 0.3)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
        'glow-cyan-sm': '0 0 10px 0 rgba(0, 240, 255, 0.25)',
      },
      animation: {
        'gauge-pulse': 'gaugePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'telemetry-scan': 'telemetryScan 3s linear infinite',
      },
      keyframes: {
        gaugePulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.02)' },
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
