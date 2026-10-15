/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // hover: 를 마우스가 있는 기기에서만 켠다. 터치 기기에서는 누른 뒤 hover 색이
  // 그대로 남아 '눌린 채로' 보인다. 클래스 수백 곳을 mouse: 로 바꾸는 대신 한 번에.
  future: {
    hoverOnlyWhenSupported: true,
  },
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
        // 연한 쪽(50~400)은 그대로, 진한 쪽만 내렸다(2026-10-15). 예전 600(#62a762)
        // 위 흰 글자는 명암비 2.9:1 로 본문 글자 기준(4.5:1)에 한참 못 미쳤다.
        //   500 #4f9f55  3.2:1 — 면·아이콘·막대
        //   600 #2f8a3e  4.4:1 — 주 버튼(굵은 글자)
        //   700 #2b7a38  5.3:1 — 눌림·글자색
        brand: {
          50: '#f1f9f1',
          100: '#dff1df',
          200: '#c4e3c4',
          300: '#abd4ab',
          400: '#97c697',
          500: '#4f9f55',
          600: '#2f8a3e',
          700: '#2b7a38',
          800: '#245f2e',
          900: '#1d4a25',
        },
        // 화면 바탕. 흰 카드가 이 위에 놓여 선 없이 면으로 구분된다.
        surface: '#f2f4f6',
      },
      borderRadius: {
        // 카드 기본 곡률. 3xl(24px)은 좁은 카드에서 너무 둥글다.
        card: '20px',
      },
      fontFamily: {
        // 토스에서 받은 Toss Product Sans 를 기본 고딕으로(2026-10-15). 글꼴 파일은
        // static.toss.im 에서 오므로(index.css), 늦거나 막히면 바로 뒤의 Pretendard 로 보인다.
        sans: [
          'Toss Product Sans',
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
        lift: '0 4px 8px rgba(15, 23, 42, 0.06), 0 24px 48px -16px rgba(47, 138, 62, 0.18)',
        // 바텀시트·토스트처럼 화면 위에 떠 있는 것.
        sheet: '0 -8px 32px -8px rgba(15, 23, 42, 0.18)',
        float: '0 8px 24px -6px rgba(15, 23, 42, 0.22)',
        // 하단 탭바·고정 버튼 바 위쪽 경계. 선 대신.
        bar: '0 -1px 0 rgba(15, 23, 42, 0.04), 0 -6px 16px -10px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
}
