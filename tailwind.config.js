/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 기기 구분 기준 (논리 픽셀)
      //   base           아이폰 세로 (320~430)
      //   sm   640        아이폰 가로
      //   md   768        아이패드 세로 시작 (mini 744 제외한 전 기종) — 여기서부터 전체 네비 노출
      //   lg   1024       아이패드 가로 / 12.9" 세로
      //   xl   1280       맥북 / 대형 아이패드 가로 — 2단 레이아웃 시작
      //   2xl  1536       맥북 14"·16"
      // 폭만으로는 아이패드 가로와 맥북을 구분할 수 없어 포인터 종류를 함께 사용한다.
      //   touch  손가락(아이폰·아이패드) — 터치 타겟 키우기
      //   mouse  마우스/트랙패드(맥북) — hover 전제 UI
      screens: {
        touch: { raw: '(pointer: coarse)' },
        mouse: { raw: '(pointer: fine)' },
      },
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
