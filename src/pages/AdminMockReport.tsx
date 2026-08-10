import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAccount } from '../lib/account'
import { listAttemptsForUser, listKoreanMocks, listMockScores } from '../lib/firestore'
import { attemptToMockScore } from '../lib/mockAttemptScore'
import { MockScoreTrend } from '../components/MockScoreTrend'
import {
  getMockSubject,
  type Attempt,
  type KoreanMock,
  type MockScore,
  type UserAccount,
} from '../lib/types'

/**
 * 학생에게 건네는 성적 추이표. 인쇄해서 PDF 로 저장한다.
 *
 * 앱 껍데기(네비게이션) 밖의 라우트라 화면이 곧 지면이다. 인쇄 버튼과
 * 돌아가기만 .no-print 로 빼고 나머지는 그대로 종이에 나간다.
 *
 * 관리자 화면의 문구('직접 입력한 성적', '관리자만 볼 수 있음')는 여기에
 * 들어오면 안 된다 — 학생과 학부모가 읽는 문서다.
 */

/**
 * 성적표 한 줄. 그래프에 쓰는 값(raw)은 100점 만점으로 맞춘 점수다.
 * 부분 편성 시험지를 응시한 회차만 원본 점수를 함께 달고 다니며, 표에서
 * '61점 (52/67)' 처럼 병기한다.
 */
type ReportRow = MockScore & { rawOriginal?: number; totalPoints?: number }

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}. ${Number(m)}. ${Number(d)}.`
}

function todayLabel(): string {
  const now = new Date()
  const f = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return f.format(now)
}

function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-[11px] tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

export function AdminMockReport() {
  const { id } = useParams()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [scores, setScores] = useState<MockScore[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [mocks, setMocks] = useState<KoreanMock[]>([])
  const [loading, setLoading] = useState(true)
  /** 앱에서 응시한 모의고사도 성적표에 넣을지. */
  const [includeAttempts, setIncludeAttempts] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([
      getAccount(id),
      listMockScores(id),
      listAttemptsForUser(id),
      listKoreanMocks(),
    ])
      .then(([acc, ms, atts, km]) => {
        if (cancelled) return
        setAccount(acc)
        setScores(ms)
        setAttempts(atts)
        setMocks(km)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  /**
   * 앱에서 응시한 국어 모의고사를 성적 한 줄씩으로 환산한 것.
   *
   * 부분 편성 시험지(52점·76점 만점 등)는 100점 만점으로 환산해서 넣는다.
   * 원점수를 그대로 얹으면 22/52 와 64/100 이 같은 높이에 찍혀 추이가
   * 뒤집힌다. 환산했다는 사실은 표에 원점수/만점을 병기해 남긴다.
   *
   * 등급은 환산하지 않는다 — 그 시험지의 등급컷으로 판정한 값이라 손대면
   * 근거가 사라진다.
   */
  const attemptRows = useMemo(() => {
    const byId = new Map(mocks.map((m) => [m.id, m]))
    const rows: ReportRow[] = []
    for (const a of attempts) {
      if (a.type !== 'korean_mock' || a.practice) continue
      if ((a.mockSubject ?? 'korean') !== 'korean') continue
      const mock = byId.get(a.refId)
      // 영어 시험지에 과목 표시가 없던 예전 기록은 시험지 쪽에서 한 번 더 거른다.
      if (mock && getMockSubject(mock) !== 'korean') continue
      const converted = attemptToMockScore(a, mock)
      if (!converted || converted.totalPoints <= 0) continue
      const { score, totalPoints } = converted
      const actual = score.raw ?? 0
      if (totalPoints === 100) {
        rows.push(score)
        continue
      }
      rows.push({
        ...score,
        raw: Math.round((actual / totalPoints) * 100),
        rawOriginal: actual,
        totalPoints,
      })
    }
    return rows
  }, [attempts, mocks])

  const rows: ReportRow[] = useMemo(
    () =>
      [...scores.filter((s) => s.inTrend), ...(includeAttempts ? attemptRows : [])].sort(
        (a, b) => a.dateISO.localeCompare(b.dateISO),
      ),
    [scores, attemptRows, includeAttempts],
  )

  const summary = useMemo(() => {
    const grades = rows.map((r) => r.grade).filter((g): g is number => g != null)
    const raws = rows.map((r) => r.raw).filter((n): n is number => n != null)
    const lastRow = rows[rows.length - 1]
    return {
      best: grades.length ? Math.min(...grades) : null,
      latest: lastRow?.grade ?? null,
      latestRaw: lastRow?.raw ?? null,
      rawAvg: raws.length ? Math.round(raws.reduce((a, b) => a + b, 0) / raws.length) : null,
      hasGrade: grades.length > 0,
      hasRaw: raws.length > 0,
    }
  }, [rows])

  if (loading) return <p className="p-8 text-sm text-slate-500">불러오는 중...</p>
  if (!account) return <p className="p-8 text-sm text-red-600">학생을 찾을 수 없습니다.</p>

  const period =
    rows.length > 0
      ? `${fmtDate(rows[0].dateISO)} ~ ${fmtDate(rows[rows.length - 1].dateISO)}`
      : '-'

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto flex max-w-[210mm] items-center justify-between px-4 pb-4 no-print">
        <Link
          to={`/admin/students/${account.id}`}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← {account.displayName} 학생
        </Link>
        <div className="flex items-center gap-4">
          {attemptRows.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeAttempts}
                onChange={(e) => setIncludeAttempts(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              앱에서 응시한 모의고사 포함 ({attemptRows.length}회)
            </label>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            PDF로 저장 · 인쇄
          </button>
        </div>
      </div>

      <article className="report-page mx-auto max-w-[210mm] bg-white px-10 py-10 shadow-soft print:shadow-none">
        <header className="flex items-end justify-between border-b border-slate-900 pb-4">
          <div>
            <p className="text-[11px] font-medium tracking-[0.2em] text-slate-500">
              국어 모의고사
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              성적 추이
            </h1>
          </div>
          <div className="text-right text-[11px] leading-relaxed text-slate-500">
            <p>발행일 {todayLabel()}</p>
          </div>
        </header>

        <section className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-slate-700">
          <p className="text-base font-semibold text-slate-900">{account.displayName}</p>
          {account.school && <p className="text-slate-500">{account.school}</p>}
          <p className="text-slate-500">{period}</p>
          <p className="text-slate-500">응시 {rows.length}회</p>
        </section>

        {rows.length === 0 ? (
          <p className="mt-10 rounded-lg border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
            표시할 성적이 없습니다.
          </p>
        ) : (
          <>
            <section className="mt-6 flex gap-3">
              {summary.hasGrade && (
                <Summary
                  label="최근 등급"
                  value={summary.latest != null ? `${summary.latest}등급` : '—'}
                  /* 시험명은 길어서 카드를 밀어낸다. 이름은 아래 표에서 읽는다. */
                  sub={fmtDate(rows[rows.length - 1].dateISO)}
                />
              )}
              {summary.hasGrade && (
                <Summary
                  label="최고 등급"
                  value={summary.best != null ? `${summary.best}등급` : '—'}
                />
              )}
              {summary.hasRaw && (
                <Summary
                  label="원점수 평균"
                  value={summary.rawAvg != null ? `${summary.rawAvg}점` : '—'}
                  sub={
                    summary.latestRaw != null ? `최근 ${summary.latestRaw}점` : undefined
                  }
                />
              )}
            </section>

            <section className="mt-6 space-y-4">
              {summary.hasGrade && (
                <MockScoreTrend
                  scores={rows}
                  metric="grade"
                  subtitle={null}
                  caption={null}
                  animate={false}
                />
              )}
              {summary.hasRaw && (
                <MockScoreTrend
                  scores={rows}
                  metric="raw"
                  subtitle={null}
                  caption={null}
                  animate={false}
                />
              )}
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-semibold text-slate-900">회차별 기록</h2>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-slate-200 text-[11px] tracking-wider text-slate-500">
                    <th className="w-10 py-2 text-left font-medium">회차</th>
                    <th className="py-2 text-left font-medium">시험</th>
                    <th className="w-28 py-2 text-left font-medium">응시일</th>
                    <th className="w-20 py-2 text-right font-medium">원점수</th>
                    <th className="w-16 py-2 text-right font-medium">등급</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="py-2 text-slate-900 break-keep">{r.title}</td>
                      <td className="py-2 text-slate-500 tabular-nums">
                        {fmtDate(r.dateISO)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <span className="text-slate-900">
                          {r.raw != null ? `${r.raw}점` : '—'}
                        </span>
                        {/* 환산한 회차만 원점수를 한 줄 내려 적는다. 괄호로 옆에
                            붙이면 숫자 열의 오른쪽 정렬이 어긋난다. */}
                        {r.totalPoints != null && r.rawOriginal != null && (
                          <span className="block text-[10px] leading-tight text-slate-400">
                            {r.rawOriginal}/{r.totalPoints} 환산
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-medium text-slate-900 tabular-nums">
                        {r.grade != null ? `${r.grade}등급` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </article>
    </div>
  )
}
