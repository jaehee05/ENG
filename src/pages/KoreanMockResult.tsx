import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { GlossedPassage } from '../components/GlossedPassage'
import {
  getAttempt,
  listKoreanMockAttempts,
  updateKoreanMockAttemptAnswers,
  watchKoreanMock,
} from '../lib/firestore'
import { blendedTeamStats, hasStats, savedStats, teamStats } from '../lib/mockStats'
import {
  AnswerCompareOmr,
  GradeCutTable,
  ScoreHero,
  SourceTabs,
  WrongRateTop,
  type StatsSource,
} from '../components/MockResultStats'
import {
  choiceMark,
  hasMockExplanation,
  isBlankHtml,
  hasMockPassage,
  mockLinkLabels,
  mockWrongChoiceEntries,
  MOCK_SUBJECT_LABEL,
  questionPoints,
  type Attempt,
  type KoreanMock,
  type KoreanMockQuestion,
  type KoreanMockResult,
  type MockSubject,
} from '../lib/types'
import {
  BottomSheet,
  Button,
  PageHeader,
  SkeletonList,
  buttonClass,
} from '../components/ui'

/**
 * 오답 리뷰 지문. 영어는 어휘를 탭하면 뜻이 뜨는 GlossedPassage로,
 * 국어는 지문이 그 자체로 읽을 대상이라 그대로 보여준다.
 * 해석은 기본으로 접어 둔다 — 먼저 원문을 다시 읽어보게 하려는 의도.
 */
function MockPassageReview({
  question,
  subject,
}: {
  question: KoreanMockQuestion
  subject: MockSubject
}) {
  const [showKo, setShowKo] = useState(false)
  const glossary = question.glossary ?? []
  const passage = question.passage ?? ''

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">지문</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        {subject === 'english' && glossary.length > 0 ? (
          <GlossedPassage
            passage={passage}
            glossary={glossary}
            className="text-[15px] leading-8 text-slate-900 break-words whitespace-pre-wrap text-justify"
          />
        ) : (
          <p className="text-[15px] leading-8 text-slate-900 whitespace-pre-wrap break-words text-justify">
            {passage}
          </p>
        )}
      </div>

      {subject === 'english' && glossary.length > 0 && (
        <p className="text-[11px] text-slate-400">
          회색으로 표시된 단어를 누르면 뜻이 나옵니다.
        </p>
      )}

      {question.passageKo && (
        <div>
          <button
            type="button"
            onClick={() => setShowKo((v) => !v)}
            className="text-xs font-medium text-brand-700 hover:underline py-1"
          >
            {showKo ? '해석 접기' : '해석 보기'}
          </button>
          {showKo && (
            <p className="mt-1 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-7 text-slate-700 whitespace-pre-wrap break-words">
              {question.passageKo}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function KoreanMockResult() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>()
  const { profile } = useAuth()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 이 시험의 전체 응시 기록 — OUR-TEAM 통계용. */
  const [teamAttempts, setTeamAttempts] = useState<Attempt[] | null>(null)
  const [source, setSource] = useState<StatsSource | null>(null)
  const [explNumber, setExplNumber] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editResults, setEditResults] = useState<KoreanMockResult[] | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!attemptId) return
    getAttempt(attemptId)
      .then((a) => {
        if (!a) setError('결과를 찾을 수 없습니다.')
        else setAttempt(a)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [attemptId])

  // 한 번 읽고 끝내지 않고 계속 듣는다. 관리자가 해설을 저장하면 이 화면이
  // 바로 따라온다 — 못 누르던 번호가 눌리고, 열어 둔 해설도 그 자리에서 바뀐다.
  useEffect(() => {
    if (!id) return
    return watchKoreanMock(id, setMock)
  }, [id])

  useEffect(() => {
    if (!id) return
    listKoreanMockAttempts(id)
      .then(setTeamAttempts)
      // 통계를 못 읽어도 내 결과는 보여야 한다 — 내 기록만으로 계산한다.
      .catch(() => setTeamAttempts([]))
  }, [id])

  // 문항 번호 → 배점 (공통 + 선택과목 전체에서 조회, 없으면 2점).
  const pointsByNumber = useMemo(() => {
    const map = new Map<number, number>()
    if (mock) {
      for (const q of mock.questions) map.set(q.number, questionPoints(q))
      for (const el of mock.electives ?? [])
        for (const q of el.questions) map.set(q.number, questionPoints(q))
    }
    return map
  }, [mock])

  if (loading) return <SkeletonList rows={3} className="max-w-lg mx-auto" />
  if (error) return <p className="text-[15px] text-red-500 px-1">{error}</p>
  if (!attempt || !attempt.koreanMockResults) return null

  const results =
    editing && editResults ? editResults : attempt.koreanMockResults
  const canEdit = profile?.role === 'admin'
  const subj: MockSubject = attempt.mockSubject ?? mock?.subject ?? 'korean'

  function startEditAnswers() {
    setEditResults(attempt!.koreanMockResults!.map((r) => ({ ...r })))
    setEditing(true)
  }
  function cycleAnswer(idx: number) {
    setEditResults((prev) => {
      if (!prev) return prev
      const next = [...prev]
      const r = next[idx]
      const ua = r.userAnswer >= 5 ? 0 : r.userAnswer + 1 // 1→2→3→4→5→0(미응답)→1
      next[idx] = {
        ...r,
        userAnswer: ua,
        correct: ua > 0 && ua === r.correctAnswer,
      }
      return next
    })
  }
  async function saveEditAnswers() {
    if (!attemptId || !editResults) return
    setSavingEdit(true)
    try {
      await updateKoreanMockAttemptAnswers(attemptId, editResults)
      const correct = editResults.filter((r) => r.correct).length
      setAttempt((a) =>
        a ? { ...a, koreanMockResults: editResults, correct, total: editResults.length } : a,
      )
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSavingEdit(false)
    }
  }
  const pointsOf = (n: number) => pointsByNumber.get(n) ?? 2
  // 문항 번호 → 문항. 공통 + 응시한 선택과목 문항.
  // 해설(정답/오답)과 오답 리뷰 지문을 모두 여기서 꺼내 쓴다.
  const explByNumber = new Map<number, KoreanMockQuestion>()
  const passageByNumber = new Map<number, KoreanMockQuestion>()
  /** 문항 번호 → 연계 교재 출처. 해설이 없어도 이것만으로 열어볼 값어치가 있다. */
  const linkByNumber = new Map<number, string>()
  if (mock) {
    const collect = (q: KoreanMockQuestion) => {
      if (hasMockExplanation(q)) explByNumber.set(q.number, q)
      if (hasMockPassage(q)) passageByNumber.set(q.number, q)
      if (q.linkedSource?.trim()) linkByNumber.set(q.number, q.linkedSource)
    }
    for (const q of mock.questions) collect(q)
    const el = attempt.mockElectiveName
      ? mock.electives?.find((e) => e.name === attempt.mockElectiveName)
      : undefined
    for (const q of el?.questions ?? []) collect(q)
  }
  const totalPoints = results.reduce((s, r) => s + pointsOf(r.number), 0)
  const score = results.reduce((s, r) => s + (r.correct ? pointsOf(r.number) : 0), 0)
  // OUR-TEAM 은 늘 있고(추정치가 없으면 우리 학생 응시 기록으로), 전국단위는 관리자가 넣어 둔 시험만.
  const me: Attempt = { ...attempt, koreanMockResults: results }
  const sources: StatsSource[] = hasStats(mock?.national) ? ['team', 'national'] : ['team']
  const activeSource: StatsSource = source && sources.includes(source) ? source : sources[sources.length - 1]
  const stats = mock
    ? activeSource === 'national'
      ? savedStats(mock, me, mock.national!, null)
      : mock.team && hasStats(mock.team)
        ? blendedTeamStats(mock, me, teamAttempts ?? [])
        : teamStats(mock, me, teamAttempts ?? [])
    : null
  const commonNumbers = mock?.questions.map((q) => q.number) ?? []
  const commonSet = new Set(commonNumbers)
  const commonScore = results.reduce(
    (s, r) => s + (r.correct && commonSet.has(r.number) ? pointsOf(r.number) : 0),
    0,
  )
  const electiveNames = mock?.electives?.map((e) => e.name) ?? []
  const sourceNote =
    activeSource === 'national'
      ? '전국단위 모집단 환산'
      : `OUR-TEAM ${stats?.sampleSize ?? 0}명 기준`
  const heroParts = [
    ...(attempt.mockElectiveName && commonNumbers.length
      ? [
          { label: '공통', value: `${commonScore}점` },
          { label: attempt.mockElectiveName, value: `${score - commonScore}점` },
        ]
      : []),
    { label: '표준점수', value: stats?.std != null ? String(stats.std) : '-' },
    { label: '백분위', value: stats?.pct != null ? String(stats.pct) : '-' },
  ]
  /** 결과 OMR 줄을 누르면 해설 — 정오표와 같은 조건. */
  const openable = (num: number) => {
    const r = results.find((x) => x.number === num)
    return (
      explByNumber.has(num) ||
      linkByNumber.has(num) ||
      (passageByNumber.has(num) && (!r?.correct || canEdit))
    )
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <PageHeader title="결과" />

      <ScoreHero
        title={attempt.refTitle}
        studentName={attempt.studentName}
        score={score}
        totalPoints={totalPoints}
        grade={stats?.grade ?? null}
        gradeOpenEnded={stats?.gradeOpenEnded ?? false}
        parts={heroParts}
      />

      {stats && (
        <>
          <SourceTabs value={activeSource} onChange={setSource} options={sources} />
          <GradeCutTable
            stats={stats}
            electiveNames={electiveNames}
            myGrade={stats.grade}
            note={activeSource === 'national' ? '전국단위 모집단 환산' : undefined}
          />
          <WrongRateTop
            stats={stats}
            results={results}
            commonNumbers={commonNumbers}
            note={`${electiveNames.length ? '공통과목 기준 · ' : ''}${sourceNote}`}
          />
          <AnswerCompareOmr
            results={results}
            commonNumbers={commonNumbers}
            electiveName={attempt.mockElectiveName}
            commonTitle={electiveNames.length ? '공통과목' : MOCK_SUBJECT_LABEL[subj]}
            stats={stats}
            note={`숫자=${activeSource === 'national' ? '전국단위 모집단 환산' : 'OUR-TEAM'} 선택률(%)`}
            onRowClick={(num) => {
              if (!editing && openable(num)) setExplNumber(num)
            }}
          />
        </>
      )}

      {/* 출제자 한마디 */}
      {mock?.examinerComment && (
        <div className="rounded-card bg-white p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 overflow-hidden">
            <span className="font-serif text-4xl leading-none translate-y-[0.18em]">
              &ldquo;
            </span>
          </span>
          <p className="mt-3 text-base font-bold text-slate-900 font-maruburi">
            출제자의 한마디
          </p>
          <p className="mt-1.5 text-sm text-slate-500 leading-loose whitespace-pre-wrap font-maruburi">
            {mock.examinerComment}
          </p>
          <div className="flex justify-end mt-2">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 overflow-hidden">
              <span className="font-serif text-4xl leading-none translate-y-[0.18em]">
                &rdquo;
              </span>
            </span>
          </div>
        </div>
      )}

      {mock?.explanationPdfUrl && (
        <a
          href={mock.explanationPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ size: 'lg', block: true })}
        >
          해설 PDF 보기
        </a>
      )}

      {/* 정오표 */}
      <div className="rounded-card bg-white overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-slate-900">정오표</h3>
          {canEdit &&
            (editing ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="text" onClick={() => setEditing(false)}>
                  취소
                </Button>
                <Button size="sm" onClick={saveEditAnswers} loading={savingEdit}>
                  저장
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={startEditAnswers}>
                답 수정
              </Button>
            ))}
        </div>
        {editing && (
          <p className="px-5 pb-2 text-[13px] text-slate-500">
            학생답을 누르면 1→2→3→4→5→미응답 순으로 바뀌어요.
          </p>
        )}
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-[12px] text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">문항</th>
              <th className="px-2 py-2 text-center font-semibold">배점</th>
              <th className="px-2 py-2 text-center font-semibold">정답</th>
              <th className="px-2 py-2 text-center font-semibold">학생답</th>
              <th className="px-3 py-2 text-center font-semibold">정오</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => {
              const unanswered = r.userAnswer === 0
              const hasExpl = explByNumber.has(r.number)
              // 지문은 틀린 문항에서만. 관리자는 검수용으로 항상 볼 수 있다.
              const showPassage =
                passageByNumber.has(r.number) && (!r.correct || canEdit)
              const hasLink = linkByNumber.has(r.number)
              const tappable = !editing && (hasExpl || showPassage || hasLink)
              return (
                <tr
                  key={i}
                  onClick={tappable ? () => setExplNumber(r.number) : undefined}
                  className={`${r.correct ? '' : 'bg-red-50/40'} ${
                    tappable ? 'cursor-pointer hover:bg-slate-50' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 font-semibold text-slate-800">
                    {r.number}번
                    {/* 눌러서 볼 수 있는 줄임을 표시한다. 해설이 나중에 올라오면
                        새로고침 없이 이 표시가 붙고 그때부터 눌린다. */}
                    {hasExpl && (
                      <span className="ml-1.5 inline-block rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        해설
                      </span>
                    )}
                    {showPassage && (
                      <span className="ml-1.5 inline-block rounded bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        지문
                      </span>
                    )}
                    {/* 해설이 없어도 연계만으로 열리는 줄이 있다. 눌리는 줄임을
                        표시해 두지 않으면 눌러볼 이유를 모른다. */}
                    {hasLink && (
                      <span className="ml-1.5 inline-block rounded bg-amber-50 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        연계
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-500 tabular-nums">
                    {pointsOf(r.number)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span className="inline-block w-6 h-6 leading-6 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {r.correctAnswer}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => cycleAnswer(i)}
                        className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold border-2 border-dashed ${
                          unanswered
                            ? 'text-slate-300 border-slate-300'
                            : r.correct
                              ? 'bg-brand-100 text-brand-700 border-brand-300'
                              : 'bg-red-100 text-red-600 border-red-300'
                        }`}
                      >
                        {unanswered ? '—' : r.userAnswer}
                      </button>
                    ) : unanswered ? (
                      <span className="text-slate-300 text-xs">—</span>
                    ) : (
                      <span
                        className={`inline-block w-6 h-6 leading-6 rounded-full text-xs font-semibold ${
                          r.correct
                            ? 'bg-brand-100 text-brand-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {r.userAnswer}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.correct ? (
                      <span className="text-brand-600 font-bold">○</span>
                    ) : (
                      <span className="text-red-500 font-bold">✕</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Link to={`/korean-mocks/${id}`} className={buttonClass({ variant: 'secondary', block: true, className: 'bg-white' })}>
          모의고사로
        </Link>
        <Link to="/korean-mocks" className={buttonClass({ variant: 'secondary', block: true, className: 'bg-white' })}>
          목록으로
        </Link>
      </div>

      {/* 문항 해설 모달 */}
      {explNumber != null &&
        (() => {
          const r = results.find((x) => x.number === explNumber)
          const explQ = explByNumber.get(explNumber)
          const wrongEntries = explQ ? mockWrongChoiceEntries(explQ) : []
          // 지문은 틀렸을 때만 (관리자는 검수용으로 항상)
          const pq = passageByNumber.get(explNumber)
          const passageQ = pq && (!r?.correct || canEdit) ? pq : undefined
          const linkLabels = mockLinkLabels(linkByNumber.get(explNumber))
          return (
            <BottomSheet
              open
              onClose={() => setExplNumber(null)}
              title={`${explNumber}번 ${r && !r.correct ? '오답 리뷰' : '해설'}`}
            >
                <div className="space-y-4">
                  {r && (
                    <div className="flex items-center gap-4 text-[15px]">
                      <span className="text-slate-500">
                        정답{' '}
                        <span className="font-bold text-slate-900">
                          {r.correctAnswer}
                        </span>
                      </span>
                      <span className="text-slate-500">
                        내 답{' '}
                        <span
                          className={`font-bold ${
                            r.correct ? 'text-brand-700' : 'text-red-600'
                          }`}
                        >
                          {r.userAnswer === 0 ? '미응답' : r.userAnswer}
                        </span>
                      </span>
                    </div>
                  )}
                  {/* 연계 교재 칩. 해설보다 먼저 온다 — 이 문항이 어디서 왔는지
                      먼저 알고 해설을 읽게 하려는 것. */}
                  {linkLabels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* '연계'는 이름표가 한 번만 달고 간다 — 칩마다 되풀이할 말이 아니다. */}
                      <span className="text-xs text-slate-500">연계</span>
                      {linkLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {passageQ && (
                    <MockPassageReview question={passageQ} subject={subj} />
                  )}

                  {/* 문항별 출제자 한마디. 해설보다 먼저 온다 — 어떻게 봐야
                      하는 문제인지 짚어주고 해설로 들어가는 순서다. 따옴표로
                      감싸는 건 결과 화면 위쪽의 시험 전체 한마디와 같은 모양 —
                      같은 사람의 말이라는 걸 생김새로 알아보게. */}
                  {!isBlankHtml(explQ?.examinerNote) && explQ?.examinerNote && (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 overflow-hidden">
                        <span className="font-serif text-3xl leading-none translate-y-[0.18em]">
                          &ldquo;
                        </span>
                      </span>
                      <p className="mt-2 text-sm font-bold text-slate-900 font-maruburi">
                        출제자의 한마디
                      </p>
                      <div
                        className="rte-view mt-1 text-sm text-slate-600 leading-loose font-maruburi"
                        dangerouslySetInnerHTML={{ __html: explQ.examinerNote }}
                      />
                      <div className="flex justify-end mt-1">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 overflow-hidden">
                          <span className="font-serif text-3xl leading-none translate-y-[0.18em]">
                            &rdquo;
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {!isBlankHtml(explQ?.explanation) && explQ?.explanation && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">
                        정답 해설{' '}
                        {r && (
                          <span className="text-brand-700">
                            {choiceMark(r.correctAnswer)}
                          </span>
                        )}
                      </p>
                      <div
                        className="rte-view text-sm text-slate-800"
                        dangerouslySetInnerHTML={{ __html: explQ.explanation }}
                      />
                    </div>
                  )}

                  {explQ && wrongEntries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">
                        오답 해설
                      </p>
                      <div className="space-y-3">
                        {wrongEntries.map((e) => (
                          <div key={e.choice} className="flex gap-2">
                            {/* 선지 번호는 저장하지 않고 표시할 때 붙인다.
                                .rte-mark 로 본문과 글꼴·줄 높이를 맞춘다. */}
                            <span className="rte-mark shrink-0 text-sm font-semibold text-slate-500">
                              {e.mark}
                            </span>
                            <div
                              className="rte-view text-sm text-slate-800 min-w-0 flex-1"
                              dangerouslySetInnerHTML={{ __html: e.html }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 선지별로 나누기 전 형식으로 입력된 오답 해설 (그대로 표시) */}
                  {!isBlankHtml(explQ?.explanationWrong) &&
                    explQ?.explanationWrong &&
                    wrongEntries.length === 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">
                        오답 해설
                      </p>
                      <div
                        className="rte-view text-sm text-slate-800"
                        dangerouslySetInnerHTML={{ __html: explQ.explanationWrong }}
                      />
                    </div>
                  )}

                  {!explQ && !passageQ && (
                    <p className="text-sm text-slate-400 py-6 text-center">
                      아직 해설이 없어요.
                    </p>
                  )}
                </div>
            </BottomSheet>
          )
        })()}
    </div>
  )
}
