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
        // HanjaMyeongjo 를 앞에 두는 이유는 index.css 의 @font-face 참고 —
        // 한자만 잡는 unicode-range 라 한글·라틴에는 영향이 없고, 나눔명조가
        // 빈출 한자 몇 자만 싣고 있어 이걸 뒤에 두면 한자끼리 글꼴이 갈린다.
        // 그 뒤의 AppleMyungjo 는 local() 이 안 잡히는 기기용 보험이다.
        // 지문에서는 나눔명조 뒤에 둬야 한다 — 앞에 두면 한자뿐 아니라 한글까지
        // 가져가 지문 글꼴이 통째로 바뀐다.
        myeongjo: [
          'HanjaMyeongjo',
          '"Nanum Myeongjo"',
          'AppleMyungjo',
          '"Apple SD Gothic Neo"',
          'serif',
        ],
        gothic: ['"Nanum Gothic"', 'sans-serif'],
        // 출제자의 한마디. 폰트가 아직 안 받아졌을 때를 대비해 이미 실려 있는
        // 나눔명조로 떨어지게 둔다 — 둘 다 부리가 있어 덜 튄다.
        maruburi: [
          'MaruBuri',
          'HanjaMyeongjo',
          'AppleMyungjo',
          '"Nanum Myeongjo"',
          '"Apple SD Gothic Neo"',
          'serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.08)',
        lift: '0 4px 8px rgba(15, 23, 42, 0.06), 0 24px 48px -16px rgba(135, 185, 135, 0.22)',
      },
    },
  },
  plugins: [],
}
