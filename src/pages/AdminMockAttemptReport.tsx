import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAccount } from '../lib/account'
import {
  getAttempt,
  getKoreanMock,
  getMockGradeOverrides,
  setMockGradeOverride,
} from '../lib/firestore'
import { ReportSummary } from '../components/ReportSummary'
import { fmtReportDate, isoKST, todayLabel } from '../lib/reportFormat'
import {
  choiceMark,
  gradeFromScore,
  questionPoints,
  MOCK_SUBJECT_LABEL,
  type Attempt,
  type KoreanMock,
  type MockGradeCut,
  type MockSubject,
  type UserAccount,
} from '../lib/types'

/**
 * 모의고사 한 회차의 성적표. 인쇄해서 PDF 로 저장한다.
 *
 * 여러 회차를 한 장에 모으는 성적 추이표(AdminMockReport)의 짝이다. 이쪽은
 * 시험 하나만 파고든다 — 원점수와 등급, 등급컷 안에서의 위치, 문항별 정오.
 *
 * 앱에서 응시한 기록만 뽑을 수 있다. 직접 입력한 성적(MockScore)은 점수만
 * 있고 문항별 내역이 없어 여기에 채울 것이 없다.
 *
 * 관리자 화면의 문구는 여기에 들어오면 안 된다 — 학생과 학부모가 읽는
 * 문서다. 등급을 채우는 칸만 .no-print 로 화면에 남긴다.
 */

/** 6등급부터는 아래를 묶어 적는다 — 결과 화면과 같은 표기. */
function gradeLabel(g: number): string {
  return g >= 6 ? '6등급 이하' : `${g}등급`
}

/**
 * 원점수가 등급컷 어디쯤인지 보여주는 막대.
 *
 * 등급컷은 1~5등급만 눈금으로 찍는다. 그 아래는 칸이 좁아 이름표가 겹치고,
 * 어차피 '6등급 이하'로 묶어 부르는 구간이다.
 */
function CutoffBar({
  score,
  total,
  cuts,
}: {
  score: number
  total: number
  cuts: MockGradeCut[]
}) {
  const pct = (v: number) => (total > 0 ? Math.max(0, Math.min(100, (v / total) * 100)) : 0)
  const marks = [...cuts]
    .filter((c) => c.grade <= 5 && c.minScore > 0 && c.minScore <= total)
    .sort((a, b) => a.minScore - b.minScore)
  return (
    <div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-3 rounded-full bg-slate-900" style={{ width: `${pct(score)}%` }} />
        {marks.map((c) => (
          <span
            key={c.grade}
            className="absolute top-0 h-3 w-px bg-slate-400"
            style={{ left: `${pct(c.minScore)}%` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-8">
        {marks.map((c) => (
          <span
            key={c.grade}
            className="absolute -translate-x-1/2 text-center text-[10px] leading-tight text-slate-400"
            style={{ left: `${pct(c.minScore)}%` }}
          >
            {c.grade}등급
            <span className="block tabular-nums">{c.minScore}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function AdminMockAttemptReport() {
  const { id, attemptId } = useParams()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [loading, setLoading] = useState(true)
  /** 등급컷이 없어 등급이 비는 회차에 관리자가 손으로 채운 등급. */
  const [gradeOverrides, setGradeOverrides] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!id || !attemptId) return
    let cancelled = false
    Promise.all([getAccount(id), getAttempt(attemptId), getMockGradeOverrides()])
      .then(async ([acc, att, ov]) => {
        if (cancelled) return
        setAccount(acc)
        setAttempt(att)
        setGradeOverrides(ov)
        if (att?.refId) {
          const m = await getKoreanMock(att.refId)
          if (!cancelled) setMock(m)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, attemptId])

  const results = useMemo(() => attempt?.koreanMockResults ?? [], [attempt])

  /** 문항 번호 → 배점. 공통 + 선택과목 전체에서 찾고, 없으면 2점. */
  const pointsOf = useMemo(() => {
    const map = new Map<number, number>()
    if (mock) {
      for (const q of mock.questions) map.set(q.number, questionPoints(q))
      for (const el of mock.electives ?? [])
        for (const q of el.questions) map.set(q.number, questionPoints(q))
    }
    return (n: number) => map.get(n) ?? 2
  }, [mock])

  /** 응시한 선택과목 등급컷이 있으면 그것, 없으면 공통 등급컷. */
  const cutoffs = useMemo(() => {
    if (attempt?.mockElectiveName && mock?.electives) {
      const el = mock.electives.find((e) => e.name === attempt.mockElectiveName)
      if (el?.gradeCutoffs?.length) return el.gradeCutoffs
    }
    return mock?.gradeCutoffs ?? []
  }, [attempt, mock])

  const scored = useMemo(() => {
    const total = results.reduce((s, r) => s + pointsOf(r.number), 0)
    const raw = results.reduce((s, r) => s + (r.correct ? pointsOf(r.number) : 0), 0)
    const wrong = results.filter((r) => !r.correct)
    return {
      total,
      raw,
      wrong,
      lost: wrong.reduce((s, r) => s + pointsOf(r.number), 0),
      correctCount: results.length - wrong.length,
    }
  }, [results, pointsOf])

  const overrideKey = `attempt:${attemptId ?? ''}`
  const grade = gradeFromScore(scored.raw, cutoffs) ?? gradeOverrides[overrideKey] ?? null
  /** 등급컷으로 나온 등급은 못 바꾼다. 비어 있을 때만 손으로 채운다. */
  const canFillGrade = gradeFromScore(scored.raw, cutoffs) == null

  async function handleGradeFill(value: string) {
    const g = value === '' ? null : Number(value)
    setGradeOverrides((prev) => {
      const next = { ...prev }
      if (g == null) delete next[overrideKey]
      else next[overrideKey] = g
      return next
    })
    try {
      await setMockGradeOverride(overrideKey, g)
    } catch {
      // 저장에 실패해도 화면 값은 남겨 둔다 — 인쇄는 계속할 수 있어야 한다.
    }
  }

  if (loading) return <p className="p-8 text-sm text-slate-500">불러오는 중...</p>
  if (!account) return <p className="p-8 text-sm text-red-600">학생을 찾을 수 없습니다.</p>
  if (!attempt || attempt.type !== 'korean_mock')
    return <p className="p-8 text-sm text-red-600">모의고사 응시 기록을 찾을 수 없습니다.</p>
  if (attempt.studentUid !== account.id)
    return <p className="p-8 text-sm text-red-600">이 학생의 응시 기록이 아닙니다.</p>
  if (results.length === 0)
    return (
      <p className="p-8 text-sm text-slate-500">
        문항별 기록이 없는 응시라 회차 성적표를 만들 수 없습니다.
      </p>
    )

  const subject: MockSubject = attempt.mockSubject ?? mock?.subject ?? 'korean'
  const dateISO = isoKST(attempt.createdAt)
  /** 부분 편성 시험지는 100점 만점으로 환산한 값을 함께 적는다. */
  const scaled =
    scored.total > 0 && scored.total !== 100
      ? Math.round((scored.raw / scored.total) * 100)
      : null

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
          <Link
            to={`/admin/students/${account.id}/report`}
            className="text-[11px] text-slate-400 hover:text-slate-900"
          >
            성적 추이표
          </Link>
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
        <header className="flex items-end justify-between gap-6 border-b border-slate-900 pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.2em] text-slate-500">
              {MOCK_SUBJECT_LABEL[subject]} 모의고사
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 break-keep">
              {attempt.refTitle}
            </h1>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-relaxed text-slate-500">
            <p>성적표</p>
            <p>발행일 {todayLabel()}</p>
          </div>
        </header>

        <section className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-slate-700">
          <p className="text-base font-semibold text-slate-900">{account.displayName}</p>
          {account.school && <p className="text-slate-500">{account.school}</p>}
          {dateISO && <p className="text-slate-500">응시 {fmtReportDate(dateISO)}</p>}
          {attempt.mockElectiveName && (
            <p className="text-slate-500">선택 {attempt.mockElectiveName}</p>
          )}
        </section>

        <section className="mt-6 flex gap-3">
          <ReportSummary
            label="원점수"
            value={`${scored.raw}점`}
            sub={
              scaled != null
                ? `${scored.total}점 만점 · 100점 환산 ${scaled}점`
                : `${scored.total}점 만점`
            }
          />
          <ReportSummary
            label="맞힌 문항"
            value={`${scored.correctCount}/${results.length}`}
            sub={scored.lost > 0 ? `실점 ${scored.lost}점` : '만점'}
          />
          <div className="flex-1 rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-[11px] tracking-wider text-slate-500">등급</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {grade != null ? gradeLabel(grade) : '—'}
            </p>
            {grade == null && canFillGrade && (
              <select
                value=""
                onChange={(e) => handleGradeFill(e.target.value)}
                className="no-print mt-1 rounded border border-dashed border-slate-300 bg-white px-1 py-0.5 text-xs text-slate-500"
                title="등급을 직접 채웁니다"
              >
                <option value="">등급 입력</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                  <option key={g} value={g}>
                    {g}등급
                  </option>
                ))}
              </select>
            )}
            {grade != null && cutoffs.length > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-400">등급컷 기준</p>
            )}
          </div>
        </section>

        {cutoffs.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">등급컷 안에서의 위치</h2>
            <div className="mt-3">
              <CutoffBar score={scored.raw} total={scored.total} cuts={cutoffs} />
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">문항별 정오</h2>
          <div className="mt-2 grid grid-cols-10 gap-1">
            {results.map((r) => (
              <div
                key={r.number}
                className={`rounded border py-1 text-center ${
                  r.correct ? 'border-slate-200' : 'border-red-300 bg-red-50'
                }`}
              >
                <span
                  className={`block text-[10px] tabular-nums ${
                    r.correct ? 'text-slate-400' : 'text-red-400'
                  }`}
                >
                  {r.number}
                </span>
                <span
                  className={`block text-sm font-semibold leading-tight ${
                    r.correct ? 'text-slate-700' : 'text-red-600'
                  }`}
                >
                  {r.correct ? '○' : '✕'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {scored.wrong.length > 0 && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-900">틀린 문항</h2>
              <p className="text-[11px] text-slate-500">
                {scored.wrong.length}문항 · 실점 {scored.lost}점
              </p>
            </div>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-200 text-[11px] tracking-wider text-slate-500">
                  <th className="w-16 py-2 text-left font-medium">문항</th>
                  <th className="w-16 py-2 text-right font-medium">배점</th>
                  <th className="w-20 py-2 text-right font-medium">정답</th>
                  <th className="w-24 py-2 text-right font-medium">학생 답</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {scored.wrong.map((r) => (
                  <tr key={r.number} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900 tabular-nums">
                      {r.number}번
                    </td>
                    <td className="py-2 text-right text-slate-500 tabular-nums">
                      {pointsOf(r.number)}점
                    </td>
                    <td className="py-2 text-right text-slate-900">
                      {choiceMark(r.correctAnswer)}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {r.userAnswer === 0 ? '미응답' : choiceMark(r.userAnswer)}
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {mock?.examinerComment && (
          <section className="mt-6 rounded-lg border border-slate-200 px-4 py-3">
            <h2 className="text-[11px] tracking-wider text-slate-500">출제자의 한마디</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {mock.examinerComment}
            </p>
          </section>
        )}
      </article>
    </div>
  )
}
