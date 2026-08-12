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
import { convertAngleInText } from '../lib/angleBrackets'
import { fmtReportDate, isoKST, todayLabel } from '../lib/reportFormat'
import {
  choiceMark,
  gradeFromScore,
  questionPoints,
  MOCK_SUBJECT_LABEL,
  type Attempt,
  type KoreanMock,
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

/** 문항 표를 몇 칸으로 갈라 놓을지. A4 한 장에 45문항을 담는 폭이다. */
const ANSWER_COLUMN_COUNT = 3

/**
 * 이름 줄의 '응시 2026. 7. 16.', '선택 화법과 작문' 같은 항목.
 *
 * 이름표와 값이 같은 크기·같은 색이면 '선택 화법과 작문'이 한 덩어리로
 * 읽힌다. 이름표는 작게 흐리게, 값은 진하게 — 눈이 값부터 집는다.
 */
function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-[10px] tracking-[0.15em] text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </p>
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

  const scored = useMemo(
    () => ({
      total: results.reduce((s, r) => s + pointsOf(r.number), 0),
      raw: results.reduce((s, r) => s + (r.correct ? pointsOf(r.number) : 0), 0),
      correctCount: results.filter((r) => r.correct).length,
    }),
    [results, pointsOf],
  )

  /**
   * 등급컷 표의 칸. 1~5등급을 늘어놓고 그 아래를 '6등급 이하'로 묶는다 —
   * 결과 화면과 같은 묶음이다.
   */
  const cutoffRows = useMemo(() => {
    const under = cutoffs
      .filter((c) => c.grade <= 5 && Number.isFinite(c.minScore))
      .sort((a, b) => a.grade - b.grade)
    if (under.length === 0) return []
    return [
      ...under.map((c) => ({
        grade: c.grade,
        label: `${c.grade}등급`,
        score: c.minScore as number | null,
      })),
      { grade: 6, label: '6등급 이하', score: null as number | null },
    ]
  }, [cutoffs])

  /** '6등급 이하' 칸에 적을 기준 점수 — 가장 낮은 등급컷. */
  const lowestCut = useMemo(
    () =>
      cutoffRows.reduce(
        (min, c) => (c.score != null && c.score < min ? c.score : min),
        Infinity,
      ),
    [cutoffRows],
  )

  /** 45문항이 세로로 늘어지면 지면을 넘긴다. 갈라서 나란히 놓는다. */
  const answerColumns = useMemo(() => {
    const per = Math.ceil(results.length / ANSWER_COLUMN_COUNT)
    if (per === 0) return []
    return Array.from({ length: ANSWER_COLUMN_COUNT }, (_, i) =>
      results.slice(i * per, (i + 1) * per),
    ).filter((c) => c.length > 0)
  }, [results])

  const overrideKey = `attempt:${attemptId ?? ''}`
  const grade = gradeFromScore(scored.raw, cutoffs) ?? gradeOverrides[overrideKey] ?? null
  /** 등급컷으로 나온 등급은 못 바꾼다. 비어 있을 때만 손으로 채운다. */
  const canFillGrade = gradeFromScore(scored.raw, cutoffs) == null
  /** 등급컷 표에서 학생이 받은 칸인지. 7·8·9등급은 '6등급 이하' 칸에 든다. */
  const isMyCutoffCell = (cellGrade: number) =>
    grade != null && (cellGrade === 6 ? grade >= 6 : grade === cellGrade)

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
  /**
   * 점수는 늘 100점 만점으로 환산해 적는다. 부분 편성 시험지(52점·76점 만점
   * 등)가 섞여 있어서, 회차마다 자가 달라지면 성적표끼리 견줄 수 없다.
   * 등급컷도 같은 자로 재야 점수와 나란히 읽힌다.
   */
  const toHundred = (v: number) =>
    scored.total > 0 ? Math.round((v / scored.total) * 100) : 0

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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 break-keep">
              {attempt.refTitle}
            </h1>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-relaxed text-slate-500">
            <p>성적표</p>
            <p>발행일 {todayLabel()}</p>
          </div>
        </header>

        <section className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <p className="text-base font-semibold text-slate-900">{account.displayName}</p>
          {account.school && <p className="text-slate-500">{account.school}</p>}
          {dateISO && <MetaField label="응시" value={fmtReportDate(dateISO)} />}
          {attempt.mockElectiveName && (
            <MetaField label="선택" value={attempt.mockElectiveName} />
          )}
        </section>

        <section className="mt-5 flex gap-3">
          <ReportSummary
            label="점수"
            value={`${toHundred(scored.raw)}점`}
            sub={
              scored.total === 100
                ? '100점 만점'
                : `${scored.raw}/${scored.total}점 → 100점 만점 환산`
            }
          />
          <ReportSummary
            label="맞힌 문항"
            value={`${scored.correctCount}/${results.length}`}
            sub={`${results.length}문항 중`}
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

        {cutoffRows.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-slate-900">등급컷</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-200 text-[11px] tracking-wider text-slate-500">
                  <th className="w-16 py-2 text-left font-medium">등급</th>
                  {cutoffRows.map((c) => (
                    <th key={c.grade} className="py-2 text-center font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-2 text-left text-[11px] text-slate-500">점수</td>
                  {cutoffRows.map((c) => (
                    <td
                      key={c.grade}
                      /* 받은 등급 칸만 진하게 — 표에서 자기 자리를 바로 찾는다. */
                      className={`py-2 text-center tabular-nums ${
                        isMyCutoffCell(c.grade)
                          ? 'font-semibold text-slate-900'
                          : 'text-slate-500'
                      }`}
                    >
                      {c.score != null
                        ? `${toHundred(c.score)}점 이상`
                        : `${toHundred(lowestCut)}점 미만`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">문항별 정오</h2>
            <p className="text-[11px] text-slate-500">
              {scored.correctCount}/{results.length} 정답
            </p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-x-6">
            {answerColumns.map((column, ci) => (
              <table key={ci} className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-slate-200 text-[11px] tracking-wider text-slate-500">
                    <th className="py-1 text-left font-medium">문항</th>
                    <th className="py-1 text-center font-medium">배점</th>
                    <th className="py-1 text-center font-medium">정답</th>
                    <th className="py-1 text-center font-medium">학생</th>
                    <th className="py-1 text-center font-medium">정오</th>
                  </tr>
                </thead>
                <tbody>
                  {column.map((r) => (
                    <tr
                      key={r.number}
                      className={`border-b border-slate-100 ${
                        r.correct ? '' : 'bg-red-50/60'
                      }`}
                    >
                      <td className="py-1 font-medium text-slate-900 tabular-nums">
                        {r.number}
                      </td>
                      <td className="py-1 text-center text-slate-500 tabular-nums">
                        {pointsOf(r.number)}
                      </td>
                      <td className="py-1 text-center text-slate-900">
                        {choiceMark(r.correctAnswer)}
                      </td>
                      <td
                        className={`py-1 text-center ${
                          r.userAnswer === 0 ? 'text-[11px] text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        {r.userAnswer === 0 ? '미응답' : choiceMark(r.userAnswer)}
                      </td>
                      <td
                        className={`py-1 text-center font-semibold ${
                          r.correct ? 'text-slate-700' : 'text-red-600'
                        }`}
                      >
                        {r.correct ? '○' : '✕'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>

        {mock?.examinerComment && (
          <section className="mt-5 rounded-lg border border-slate-200 px-4 py-3">
            <h2 className="text-[11px] tracking-wider text-slate-500">출제자의 한마디</h2>
            <p className="mt-1 whitespace-pre-wrap break-keep text-justify text-sm leading-relaxed text-slate-700">
              {/* 해설과 같이 부등호는 작품명 홑화살괄호로 읽어 준다. */}
              {convertAngleInText(mock.examinerComment)}
            </p>
          </section>
        )}
      </article>
    </div>
  )
}
