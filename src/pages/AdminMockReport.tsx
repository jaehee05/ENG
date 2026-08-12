import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAccount } from '../lib/account'
import {
  getMockAttemptTrend,
  getMockGradeOverrides,
  listAttemptsForUser,
  listKoreanMocks,
  listMockScores,
  setMockGradeOverride,
  updateMockScore,
} from '../lib/firestore'
import { koreanMockRowsFromAttempts, type MockRow } from '../lib/mockAttemptScore'
import { MockScoreTrend } from '../components/MockScoreTrend'
import { ReportSummary } from '../components/ReportSummary'
import { fmtReportDate, todayLabel } from '../lib/reportFormat'
import type { Attempt, KoreanMock, MockScore, UserAccount } from '../lib/types'

/**
 * 학생에게 건네는 성적 추이표. 인쇄해서 PDF 로 저장한다.
 *
 * 앱 껍데기(네비게이션) 밖의 라우트라 화면이 곧 지면이다. 인쇄 버튼과
 * 돌아가기만 .no-print 로 빼고 나머지는 그대로 종이에 나간다.
 *
 * 관리자 화면의 문구('직접 입력한 성적', '관리자만 볼 수 있음')는 여기에
 * 들어오면 안 된다 — 학생과 학부모가 읽는 문서다.
 */

type ReportRow = MockRow

export function AdminMockReport() {
  const { id } = useParams()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [scores, setScores] = useState<MockScore[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [mocks, setMocks] = useState<KoreanMock[]>([])
  const [loading, setLoading] = useState(true)
  /** 추이에 넣기로 고른 앱 응시 회차. '모의고사 성적' 탭에서 정한다. */
  const [attemptTrend, setAttemptTrend] = useState<Record<string, boolean>>({})
  /** 등급이 비어 있는 줄에 관리자가 손으로 채운 등급. 줄 id → 등급. */
  const [gradeOverrides, setGradeOverrides] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([
      getAccount(id),
      listMockScores(id),
      listAttemptsForUser(id),
      listKoreanMocks(),
      getMockGradeOverrides(),
      getMockAttemptTrend(),
    ])
      .then(([acc, ms, atts, km, ov, at]) => {
        if (cancelled) return
        setAccount(acc)
        setScores(ms)
        setAttempts(atts)
        setMocks(km)
        setGradeOverrides(ov)
        setAttemptTrend(at)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  /** 앱 응시분 중 '모의고사 성적' 탭에서 고른 회차만. */
  const attemptRows = useMemo(
    () =>
      koreanMockRowsFromAttempts(attempts, mocks).filter(
        (r) => attemptTrend[r.id.replace('attempt:', '')],
      ),
    [attempts, mocks, attemptTrend],
  )

  const rows: ReportRow[] = useMemo(
    () =>
      [...scores.filter((s) => s.inTrend), ...attemptRows]
        // 비어 있던 등급을 손으로 채운 값으로 메운다.
        .map((r) => (r.grade == null && gradeOverrides[r.id] != null
          ? { ...r, grade: gradeOverrides[r.id] }
          : r))
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [scores, attemptRows, gradeOverrides],
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

  /**
   * 비어 있던 등급을 채운다.
   *
   * 직접 입력한 성적은 그 문서에 바로 적어 '모의고사 성적' 탭에서도 보이게
   * 하고, 앱 응시분은 적을 자리가 없으므로 성적표용 보정값으로만 남긴다.
   */
  async function handleGradeFill(row: ReportRow, value: string) {
    const grade = value === '' ? null : Number(value)
    setGradeOverrides((prev) => {
      const next = { ...prev }
      if (grade == null) delete next[row.id]
      else next[row.id] = grade
      return next
    })
    try {
      if (row.id.startsWith('attempt:')) {
        await setMockGradeOverride(row.id, grade)
      } else {
        await updateMockScore(row.id, { grade })
        if (account) setScores(await listMockScores(account.id))
      }
    } catch {
      // 저장에 실패해도 화면 값은 남겨 둔다 — 인쇄는 계속할 수 있어야 한다.
    }
  }

  if (loading) return <p className="p-8 text-sm text-slate-500">불러오는 중...</p>
  if (!account) return <p className="p-8 text-sm text-red-600">학생을 찾을 수 없습니다.</p>

  const period =
    rows.length > 0
      ? `${fmtReportDate(rows[0].dateISO)} ~ ${fmtReportDate(rows[rows.length - 1].dateISO)}`
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
            <span className="text-[11px] text-slate-400">
              앱 응시 {attemptRows.length}회 포함
            </span>
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
                <ReportSummary
                  label="최근 등급"
                  value={summary.latest != null ? `${summary.latest}등급` : '—'}
                  /* 시험명은 길어서 카드를 밀어낸다. 이름은 아래 표에서 읽는다. */
                  sub={fmtReportDate(rows[rows.length - 1].dateISO)}
                />
              )}
              {summary.hasGrade && (
                <ReportSummary
                  label="최고 등급"
                  value={summary.best != null ? `${summary.best}등급` : '—'}
                />
              )}
              {summary.hasRaw && (
                <ReportSummary
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
                        {fmtReportDate(r.dateISO)}
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
                        {r.grade != null ? (
                          `${r.grade}등급`
                        ) : (
                          <>
                            {/* 인쇄물에는 빈칸으로 나가고, 화면에서만 고를 수 있다. */}
                            <span className="print-only">—</span>
                            <select
                              value=""
                              onChange={(e) => handleGradeFill(r, e.target.value)}
                              className="no-print rounded border border-dashed border-slate-300 bg-white px-1 py-0.5 text-xs font-normal text-slate-500"
                              title="등급을 직접 채웁니다"
                            >
                              <option value="">등급 입력</option>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                                <option key={g} value={g}>
                                  {g}등급
                                </option>
                              ))}
                            </select>
                          </>
                        )}
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
