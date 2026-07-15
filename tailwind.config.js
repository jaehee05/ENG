/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f9f1',
          100: '#dff1df',
          200: '#c4e3c4',
          300: '#abd4ab',
          400: '#97c697',
          500: '#87b987',
          600: '#62a762',
          700: '#4b8b4b',
          800: '#3b6d3b',
          900: '#2e562e',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'system-ui',
          'sans-serif',
        ],
        myeongjo: ['"Nanum Myeongjo"', 'serif'],
        gothic: ['"Nanum Gothic"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.08)',
        lift: '0 4px 8px rgba(15, 23, 42, 0.06), 0 24px 48px -16px rgba(135, 185, 135, 0.22)',
      },
    },
  },
  plugins: [],
}
