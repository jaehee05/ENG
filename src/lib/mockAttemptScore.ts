import {
  gradeFromScore,
  questionPoints,
  type Attempt,
  type KoreanMock,
  type MockScore,
} from './types'

/**
 * 앱에서 응시한 모의고사 기록을 성적 한 줄로 환산한다.
 *
 * 결과 화면(KoreanMockResult)이 하던 계산과 같은 규칙이다.
 * - 원점수 = 맞힌 문항의 배점 합 (배점 미설정은 2점)
 * - 등급 = 응시한 선택과목의 등급컷 우선, 없으면 공통 등급컷. 둘 다 없으면 null
 *
 * 성적표에서 직접 입력한 성적과 나란히 놓기 위해 MockScore 모양으로 맞춰
 * 돌려준다. inTrend 는 늘 true — 앱 응시분은 켜고 끄는 단위가 성적표의
 * 토글이지, 기록 하나하나가 아니다.
 *
 * totalPoints 를 함께 돌려준다. 부분 편성 시험지(52점·76점 만점 등)가 섞여
 * 있어서, 원점수를 한 축에 놓으려면 부르는 쪽이 만점을 보고 걸러야 한다.
 */
export function attemptToMockScore(
  attempt: Attempt,
  mock: KoreanMock | undefined,
): { score: MockScore; totalPoints: number } | null {
  const results = attempt.koreanMockResults
  if (!results || results.length === 0) return null

  const pointsByNumber = new Map<number, number>()
  if (mock) {
    for (const q of mock.questions) pointsByNumber.set(q.number, questionPoints(q))
    for (const el of mock.electives ?? [])
      for (const q of el.questions) pointsByNumber.set(q.number, questionPoints(q))
  }
  const pointsOf = (n: number) => pointsByNumber.get(n) ?? 2

  const raw = results.reduce((sum, r) => sum + (r.correct ? pointsOf(r.number) : 0), 0)
  const totalPoints = results.reduce((sum, r) => sum + pointsOf(r.number), 0)

  const cutoffs = (() => {
    if (attempt.mockElectiveName && mock?.electives) {
      const el = mock.electives.find((e) => e.name === attempt.mockElectiveName)
      if (el?.gradeCutoffs?.length) return el.gradeCutoffs
    }
    return mock?.gradeCutoffs
  })()

  return {
    totalPoints,
    score: {
      id: `attempt:${attempt.id}`,
      studentUid: attempt.studentUid,
      title: attempt.refTitle,
      dateISO: toISOKST(attempt.createdAt),
      raw,
      grade: gradeFromScore(raw, cutoffs),
      inTrend: true,
      createdAt: attempt.createdAt ?? null,
    },
  }
}

/** Timestamp → KST 'YYYY-MM-DD'. 없으면 오늘. */
function toISOKST(ts: Attempt['createdAt']): string {
  const d = ts?.toDate() ?? new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
