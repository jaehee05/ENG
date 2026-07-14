/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8ef',
          100: '#dfefdc',
          200: '#bfdeba',
          300: '#a5d19e',
          400: '#8bc482',
          500: '#72b768',
          600: '#58a34d',
          700: '#47843e',
          800: '#386831',
          900: '#2d5327',
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
        lift: '0 4px 8px rgba(15, 23, 42, 0.06), 0 24px 48px -16px rgba(114, 183, 104, 0.22)',
      },
    },
  },
  plugins: [],
}
