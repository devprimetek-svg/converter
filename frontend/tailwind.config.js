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
    },
  },
  plugins: [],
}
