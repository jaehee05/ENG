import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import {
  getAttempt,
  getReading,
  submitReadingRetry,
} from '../lib/firestore'
import { renderUnderlines } from '../lib/renderUnderlines'
import {
  getSharedPassageBlock,
  inferQuestionNumbers,
  type Attempt,
  type Reading,
} from '../lib/types'
import { SharedPassageBlock } from '../components/SharedPassageBlock'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

const SECTION_HEADERS = ['지문', '주어진 글', '본문', '요약문', '안내문']
const HEADER_RE = new RegExp(`^\\[(${SECTION_HEADERS.join('|')})\\]\\s*$`, 'm')

interface Section {
  header: string | null
  content: string
}

/** 기존 번역에 섞여 있을 수 있는 --- 구분선을 제거. */
function stripSeparators(text: string): string {
  return text.replace(/^\s*-{3,}\s*$/gm, '').replace(/\n{3,}/g, '\n\n')
}

function splitSections(text: string): Section[] {
  const lines = stripSeparators(text).split(/\n/)
  const sections: Section[] = []
  let current: Section = { header: null, content: '' }
  for (const line of lines) {
    const m = line.match(HEADER_RE)
    if (m) {
      if (current.content.trim() || current.header) {
        sections.push({
          header: current.header,
          content: current.content.replace(/\n+$/, ''),
        })
      }
      current = { header: m[1], content: '' }
    } else {
      current.content += line + '\n'
    }
  }
  if (current.content.trim() || current.header) {
    sections.push({
      header: current.header,
      content: current.content.replace(/\n+$/, ''),
    })
  }
  return sections
}

const BOXED_HEADERS = new Set(['주어진 글', '요약문', '안내문'])

function PassageKoSections({ text }: { text: string }) {
  const sections = splitSections(text)
  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        const body = s.content.trim()
        if (!body) return null
        if (s.header && BOXED_HEADERS.has(s.header)) {
          return (
            <div key={i}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {s.header}
              </p>
              <div className="border border-slate-700 px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap leading-relaxed font-myeongjo">
                {renderUnderlines(body)}
              </div>
            </div>
          )
        }
        // [지문] / [본문] / 헤더 없음: 평텍스트
        return (
          <div key={i}>
            {s.header && (
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {s.header}
              </p>
            )}
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-myeongjo">
              {renderUnderlines(body)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ReadingResult() {
  const { attemptId } = useParams<{ id: string; attemptId: string }>()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 문항별 로컬 재시도 상태. DB의 retryAnswers와 병합해서 화면에 표시.
  const [localRetry, setLocalRetry] = useState<Record<number, number>>({})
  // 사용자가 '다시 시도'를 눌러 선택 UI를 펼친 문항.
  const [retryOpen, setRetryOpen] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    getAttempt(attemptId)
      .then(async (a) => {
        if (cancelled) return
        if (!a) {
          setError('결과를 찾을 수 없습니다.')
          return
        }
        setAttempt(a)
        if (a.refId) {
          try {
            const r = await getReading(a.refId)
            if (!cancelled) setReading(r)
          } catch {
            // 지문 조회 실패는 결과 표시에 치명적이지 않음
          }
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attemptId])

  const wrongIndices = useMemo(() => {
    if (!attempt?.readingResults) return [] as number[]
    return attempt.readingResults
      .map((r, i) => (r.correct ? -1 : i))
      .filter((i) => i >= 0)
  }, [attempt])

  // DB의 retryAnswers와 로컬 retry 병합. DB가 우선(이미 제출된 건 못 바꿈).
  function getRetryAnswer(i: number): number | undefined {
    const fromDb = attempt?.retryAnswers?.[String(i)]
    if (typeof fromDb === 'number') return fromDb
    if (typeof localRetry[i] === 'number') return localRetry[i]
    return undefined
  }

  const alreadyReviewed = !!attempt?.wrongReviewedAt

  async function handleRetryChoice(qIdx: number, choice: number) {
    if (!attempt) return
    // 이미 제출된 문항은 재선택 불가
    if (typeof getRetryAnswer(qIdx) === 'number') return
    const nextLocal = { ...localRetry, [qIdx]: choice }
    setLocalRetry(nextLocal)
    // 이번 클릭 포함해서 모든 오답이 재시도 제출됐는지 판정
    const allDone = wrongIndices.every((i) => {
      if (i === qIdx) return true
      const v = attempt.retryAnswers?.[String(i)]
      if (typeof v === 'number') return true
      return typeof nextLocal[i] === 'number'
    })
    try {
      await submitReadingRetry(attempt.id, qIdx, choice, allDone)
      if (allDone) {
        // optimistic: 화면에 즉시 반영
        setAttempt((prev) =>
          prev
            ? {
                ...prev,
                retryAnswers: { ...(prev.retryAnswers || {}), [String(qIdx)]: choice },
              }
            : prev,
        )
      }
    } catch {
      // 실패 시 로컬 상태 롤백
      const rollback = { ...nextLocal }
      delete rollback[qIdx]
      setLocalRetry(rollback)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!attempt || !attempt.readingResults) return null

  const ratio = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0
  const hasWrong = wrongIndices.length > 0
  const passageKo = reading?.passageKo?.trim() ?? ''
  const firstQ = reading?.questions?.[0]
  const orderKoParts =
    firstQ?.type === 'order'
      ? (['A', 'B', 'C', 'D'] as const)
          .map((tag) => ({
            tag,
            en:
              tag === 'A'
                ? firstQ.partA?.trim() ?? ''
                : tag === 'B'
                  ? firstQ.partB?.trim() ?? ''
                  : tag === 'C'
                    ? firstQ.partC?.trim() ?? ''
                    : firstQ.partD?.trim() ?? '',
            ko:
              tag === 'A'
                ? firstQ.partAKo?.trim() ?? ''
                : tag === 'B'
                  ? firstQ.partBKo?.trim() ?? ''
                  : tag === 'C'
                    ? firstQ.partCKo?.trim() ?? ''
                    : firstQ.partDKo?.trim() ?? '',
          }))
          .filter((p) => p.en || p.ko)
      : []
  const hasOrderKo = orderKoParts.some((p) => p.ko)
  const hasAnyKo = hasOrderKo || !!passageKo

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <BackLink to="/reading" label="지문 목록" />
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          결과
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          {attempt.refTitle}
        </h1>
        <p className="text-xs text-slate-500 mt-1">{attempt.studentName}</p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-0.5">정답률</p>
            <p className="text-3xl font-semibold text-slate-900 tracking-tight">
              {ratio}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500 mb-0.5">맞은 문항</p>
            <p className="text-lg font-semibold text-slate-900">
              {attempt.correct}
              <span className="text-sm text-slate-400 font-normal">
                {' '}/ {attempt.total}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-brand-500"
            style={{ width: `${ratio}%` }}
          />
        </div>
      </div>

      {!hasWrong && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-sm font-medium text-brand-800">
          ✅ 만점! 과제 완료 처리되었습니다.
        </div>
      )}

      {hasWrong && alreadyReviewed && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-sm font-medium text-brand-800">
          ✅ 오답 검토 완료 — 과제 완료 처리되었습니다.
        </div>
      )}

      {hasWrong && !alreadyReviewed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm text-slate-800">
          ⚠️ <span className="font-semibold">아직 완료가 아니에요.</span> 아래 오답마다 [다시 시도]를 한 번씩 누르고, 한글 해석을 참고해서 답을 한 번만 골라요.
        </div>
      )}

      {hasWrong && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          {(hasAnyKo || (reading && reading.questions.length > 0)) && (
            <details
              className="rounded-md border border-amber-200 bg-white"
              open
            >
              <summary className="cursor-pointer text-sm font-medium text-slate-800 px-4 py-2 hover:bg-amber-50">
                지문 + 한글 해석
              </summary>
              <div className="px-4 py-3 border-t border-amber-100 space-y-4">
                {reading && (() => {
                  const numbered = inferQuestionNumbers(
                    reading.title,
                    reading.questions,
                  )
                  const shared = getSharedPassageBlock({
                    ...reading,
                    questions: numbered,
                  })
                  if (shared) {
                    return (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          지문 다시 보기
                        </p>
                        <SharedPassageBlock
                          block={shared}
                          passageGlossary={reading.glossary}
                        />
                      </div>
                    )
                  }
                  // shared가 null인 단일 문항 등 — passage / 각 문항 body 직접 표시
                  const passage = reading.passage?.trim() ?? ''
                  const bodyChunks = reading.questions
                    .map((q) =>
                      q.body && q.body.trim()
                        ? q.body.trim()
                        : q.intro && q.intro.trim()
                          ? q.intro.trim()
                          : '',
                    )
                    .filter((t) => t)
                  const chunks = passage ? [passage, ...bodyChunks] : bodyChunks
                  if (chunks.length === 0) return null
                  return (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        지문 다시 보기
                      </p>
                      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
                        {chunks.map((c, i) => (
                          <div
                            key={i}
                            className="text-base leading-7 text-slate-900 whitespace-pre-wrap text-justify font-myeongjo"
                          >
                            {renderUnderlines(c)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
                {hasAnyKo && (
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    한글 해석
                  </p>
                )}
                {hasOrderKo &&
                  orderKoParts.map((p) => (
                    <div key={p.tag}>
                      <p className="text-center text-sm font-semibold text-slate-800 mb-1.5 font-myeongjo">
                        ({p.tag})
                      </p>
                      <div className="border border-slate-700 px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap leading-relaxed font-myeongjo">
                        {p.ko ? (
                          renderUnderlines(p.ko)
                        ) : (
                          <span className="text-slate-400 text-xs">
                            (이 단락 해석 미등록)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                {passageKo && (
                  <div
                    className={
                      hasOrderKo ? 'border-t border-amber-100 pt-3' : ''
                    }
                  >
                    {hasOrderKo && (
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        통합 해석
                      </p>
                    )}
                    <PassageKoSections text={passageKo} />
                  </div>
                )}
              </div>
            </details>
          )}
          {!hasAnyKo && (
            <p className="text-xs text-slate-500">
              한글 해석은 등록되지 않았지만 위에서 지문을 다시 확인할 수 있어요.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {attempt.readingResults.map((r, i) => {
          const fromReading = reading
            ? inferQuestionNumbers(reading.title, reading.questions)[i]?.number
            : undefined
          const label = r.number ?? fromReading ?? i + 1
          const retryAns = getRetryAnswer(i)
          const retried = typeof retryAns === 'number'
          const retryCorrect = retried && retryAns === r.correctAnswer
          const isRetryOpen = !!retryOpen[i]
          // 답 공개 조건: 처음부터 맞혔거나, 재시도가 끝났거나(정답이든 오답이든)
          const revealAnswer = r.correct || retried
          return (
            <div
              key={i}
              className={`rounded-md border p-4 ${
                r.correct ? 'border-brand-200 bg-brand-50/40' : 'border-red-200 bg-red-50/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                  {label}. {renderUnderlines(r.q)}
                </p>
                {r.correct ? (
                  <span className="inline-block rounded bg-brand-100 text-brand-700 text-xs px-2 py-0.5 whitespace-nowrap">
                    정답
                  </span>
                ) : (
                  <span className="inline-block rounded bg-red-100 text-red-800 text-xs px-2 py-0.5 whitespace-nowrap">
                    오답
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {r.choices.map((c, ci) => {
                  const isUser = ci === r.userAnswer
                  const isAnswer = ci === r.correctAnswer
                  const isRetryPick = retried && ci === retryAns
                  const showAsAnswer = isAnswer && revealAnswer
                  return (
                    <div
                      key={ci}
                      className={`flex items-start gap-2 rounded px-2 py-1 ${
                        showAsAnswer
                          ? 'bg-brand-100/70'
                          : isUser && !showAsAnswer
                            ? 'bg-red-100/70'
                            : isRetryPick
                              ? 'bg-amber-100/70'
                              : ''
                      }`}
                    >
                      <span className="text-slate-500 w-5">{CHOICE_MARKS[ci]}</span>
                      <span className="flex-1 text-slate-700">{renderUnderlines(c)}</span>
                      {showAsAnswer && <span className="text-xs text-brand-700 font-medium">정답</span>}
                      {isUser && !showAsAnswer && (
                        <span className="text-xs text-red-800 font-medium">선택</span>
                      )}
                      {isRetryPick && !showAsAnswer && (
                        <span className="text-xs text-amber-700 font-medium">재시도 선택</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {(() => {
                const exp = reading?.questions[i]?.explanation?.trim()
                if (!exp) return null
                return (
                  <details className="mt-3 rounded-md border border-amber-200 bg-amber-50/40">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700 px-3 py-2 hover:bg-amber-50">
                      📖 문제 해설 보기
                    </summary>
                    <div className="px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border-t border-amber-100 font-myeongjo">
                      {renderUnderlines(exp)}
                    </div>
                  </details>
                )
              })()}

              {!r.correct && (
                <div className="mt-3 pt-3 border-t border-red-200/70 space-y-2">
                  {!retried && !isRetryOpen ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setRetryOpen((prev) => ({ ...prev, [i]: true }))
                      }}
                      className="rounded-md bg-amber-600 text-white text-sm font-semibold px-4 py-2 hover:bg-amber-700 transition"
                    >
                      다시 시도 (한 번만 가능)
                    </button>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-slate-700">
                        {retried
                          ? '재시도한 답:'
                          : '아래 선지 중 하나를 골라요 (한 번만 가능).'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {r.choices.map((_, ci) => {
                          const isPicked = retried && ci === retryAns
                          const isAnswer = ci === r.correctAnswer
                          const baseColor = retried
                            ? isAnswer
                              ? 'bg-brand-600 text-white border-brand-600'
                              : isPicked
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-slate-400 border-slate-200'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          return (
                            <button
                              key={ci}
                              type="button"
                              aria-disabled={retried}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (retried) return
                                void handleRetryChoice(i, ci)
                              }}
                              className={`rounded-full w-10 h-10 inline-flex items-center justify-center border text-sm font-medium transition ${
                                retried ? 'cursor-default' : 'cursor-pointer'
                              } ${baseColor}`}
                            >
                              {CHOICE_MARKS[ci]}
                            </button>
                          )
                        })}
                      </div>
                      {retried && (
                        <p
                          className={`text-sm font-semibold ${
                            retryCorrect ? 'text-brand-700' : 'text-red-700'
                          }`}
                        >
                          {retryCorrect
                            ? '✅ 잘 풀었어요! 다음에는 한 번에 맞혀 봐요.'
                            : `❌ 아쉬워요. 정답은 ${CHOICE_MARKS[r.correctAnswer]}번 입니다.`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Link
          to="/reading"
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          목록으로
        </Link>
      </div>
    </div>
  )
}
