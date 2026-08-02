import { matchPath } from 'react-router-dom'

export interface BackTarget {
  /** 뒤로 갈 기록이 없을 때 대신 갈 경로. */
  to: string
  /** 버튼에 적히는 이름 — 목적지가 어디인지 미리 보여준다. */
  label: string
}

interface Rule {
  pattern: string
  resolve: (
    params: Record<string, string | undefined>,
    isAdmin: boolean,
  ) => BackTarget
}

/** 파라미터를 안 쓰는 대다수 규칙용 짧은 표기. */
function fixed(to: string, label: string): Rule['resolve'] {
  return () => ({ to, label })
}

/**
 * 화면마다 "한 단계 위" 가 어디인지 적어 둔 표.
 *
 * 뒤로가기는 원래 브라우저 기록(navigate(-1))을 따라가지만, 기록이 없을 때가
 * 있다 — 푸시 알림을 눌러 앱이 바로 그 화면에서 열리거나, 웹에서 링크를 직접
 * 열거나, 새로고침한 경우다. 그때 이 표의 경로로 보낸다. 표가 없으면 뒤로가기
 * 자체를 감춘다(= 그 화면은 탭에서 바로 닿는 곳이라는 뜻).
 *
 * 위에서부터 처음 맞는 규칙을 쓴다. 구체적인 패턴을 위에 둘 것 —
 * `/vocab/corpora` 는 `/vocab/:id` 에도 맞는다.
 */
const RULES: Rule[] = [
  // ── 단어 ──
  { pattern: '/vocab/corpora/new', resolve: fixed('/vocab/corpora', '교재 관리') },
  { pattern: '/vocab/corpora/:id', resolve: fixed('/vocab/corpora', '교재 관리') },
  { pattern: '/vocab/corpora', resolve: fixed('/admin', '관리') },
  { pattern: '/vocab/student/:uid', resolve: fixed('/vocab', '학생 목록') },
  { pattern: '/vocab/series/:seriesId', resolve: fixed('/vocab', '단어 시험지') },
  {
    pattern: '/vocab/:id/take',
    resolve: ({ id }) => ({ to: `/vocab/${id}`, label: '시험지' }),
  },
  {
    pattern: '/vocab/:id/sheet',
    resolve: ({ id }) => ({ to: `/vocab/${id}`, label: '시험지' }),
  },
  {
    pattern: '/vocab/:id/result/:attemptId',
    resolve: ({ id }) => ({ to: `/vocab/${id}`, label: '시험지' }),
  },
  // 시험지가 교재에 속하면 교재로 돌아가는 게 맞지만 그건 화면이 문서를
  // 읽어야 알 수 있다 — VocabDetail 이 useBackNav 로 덮어쓴다.
  { pattern: '/vocab/:id', resolve: fixed('/vocab', '단어 시험지') },
  // 학생에겐 /vocab 이 탭이라 이 규칙이 안 쓰인다(탭에 있으면 감춘다).
  // 관리자 아이폰 탭바에만 /vocab 이 없어서 — 학생별 현황이라 성격이 달라
  // 뺐다 — 더보기로 들어온다. 그때 돌아갈 곳이 필요하다.
  { pattern: '/vocab', resolve: fixed('/more', '더보기') },

  // ── 독해 ──
  // 지문 목록 화면은 없어졌다. 결과로 들어오는 길은 학습 기록뿐이다.
  { pattern: '/reading/:id/result/:attemptId', resolve: fixed('/history', '기록') },

  // ── 내 단어장 ──
  { pattern: '/wordbook/take', resolve: fixed('/wordbook', '내 단어장') },
  { pattern: '/wordbook/result/:attemptId', resolve: fixed('/wordbook', '내 단어장') },
  { pattern: '/wordbook', resolve: fixed('/more', '더보기') },

  // ── 국어 모의고사 ──
  {
    pattern: '/admin/korean-mocks/new',
    resolve: fixed('/admin/korean-mocks', '모의고사 관리'),
  },
  { pattern: '/admin/korean-mocks', resolve: fixed('/admin', '관리') },
  {
    pattern: '/korean-mocks/:id/take',
    resolve: ({ id }) => ({ to: `/korean-mocks/${id}`, label: '모의고사' }),
  },
  {
    pattern: '/korean-mocks/:id/result/:attemptId',
    resolve: ({ id }) => ({ to: `/korean-mocks/${id}`, label: '모의고사' }),
  },
  {
    pattern: '/korean-mocks/:id',
    resolve: (_params, isAdmin) => ({
      to: isAdmin ? '/admin/korean-mocks' : '/korean-mocks',
      label: '모의고사 목록',
    }),
  },
  { pattern: '/korean-mocks', resolve: fixed('/more', '더보기') },

  // ── 관리 ──
  { pattern: '/admin/students/:id', resolve: fixed('/admin/students', '학생 관리') },
  { pattern: '/admin/students', resolve: fixed('/admin', '관리') },
  { pattern: '/admin/vocab', resolve: fixed('/admin', '관리') },
  { pattern: '/admin/notify', resolve: fixed('/admin', '관리') },
  { pattern: '/admin/announce', resolve: fixed('/admin', '관리') },
  { pattern: '/admin/categories', resolve: fixed('/admin', '관리') },
  { pattern: '/admin/payments', resolve: fixed('/admin', '관리') },
  { pattern: '/admin/availability', resolve: fixed('/admin', '관리') },
  { pattern: '/admin', resolve: fixed('/more', '더보기') },

  // ── 그 밖 ──
  { pattern: '/history', resolve: fixed('/more', '더보기') },
  { pattern: '/profile', resolve: fixed('/more', '더보기') },
  { pattern: '/notice', resolve: fixed('/more', '더보기') },
  // 알림함은 헤더 종 아이콘으로 어디서든 들어온다. 기록을 따라 되돌아가는
  // 게 맞고, 기록이 없을 때만(알림 탭으로 앱이 열린 경우) 홈으로 보낸다.
  { pattern: '/notifications', resolve: fixed('/', '홈') },
]

/** 이 경로에서 뒤로 갈 곳. 탭에서 바로 닿는 화면이면 null. */
export function resolveBackTarget(
  pathname: string,
  isAdmin: boolean,
): BackTarget | null {
  for (const rule of RULES) {
    const match = matchPath({ path: rule.pattern, end: true }, pathname)
    if (match) return rule.resolve(match.params, isAdmin)
  }
  return null
}
