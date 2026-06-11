/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf2',
          100: '#dcfce0',
          200: '#bbf7c0',
          300: '#86efac',
          400: '#3fce4a',
          500: '#0b9212',
          600: '#0a8210',
          700: '#076d0d',
          800: '#065a0b',
          900: '#054809',
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
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.08)',
        lift: '0 4px 8px rgba(15, 23, 42, 0.06), 0 24px 48px -16px rgba(11, 146, 18, 0.22)',
      },
    },
  },
  plugins: [],
}
