/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        desk: {
          50: '#fbf7ee',
          100: '#f4ebd3',
          200: '#e8d6a8',
          300: '#d9bb78',
          400: '#caa052',
          500: '#b8893f',
          600: '#9c6e33',
          700: '#7c552c',
          800: '#5f4127',
          900: '#4a3422'
        },
        sticky: {
          yellow: '#fef08a',
          pink: '#fbcfe8',
          blue: '#bae6fd',
          green: '#bbf7d0',
          orange: '#fed7aa'
        },
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--accent-hover) / <alpha-value>)'
      },
      fontFamily: {
        hand: ['"Patrick Hand"', '"Comic Sans MS"', 'cursive'],
        ui: ['system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
}
