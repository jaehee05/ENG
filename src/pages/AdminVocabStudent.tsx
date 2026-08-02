import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { getAccount } from '../lib/account'
import {
  createManualVocabAttempt,
  deleteAttempt,
  formatDate,
  listAttemptsForUser,
  listVocabSets,
} from '../lib/firestore'
import { sheetStatuses, summarizeVocab } from '../lib/vocabStatus'
import { parseVocabResultTable } from '../lib/parseVocabResultTable'
import {
  isVisibleToStudent,
  type Attempt,
  type UserAccount,
  type VocabSet,
} from '../lib/types'

/** 통과로 볼 최소 정답 수. 과제 부여 기본값과 같게 맞춘다. */
const VOCAB_PASS_THRESHOLD = 25

function rateTone(rate: number | null): string {
  if (rate === null) return 'text-slate-400'
  if (rate >= 80) return 'text-brand-700'
  if (rate >= 60) return 'text-amber-700'
  return 'text-red-600'
}

/** 관리자용 — 학생 한 명의 시험지별 응시 현황. */
export function AdminVocabStudent() {
  const { uid } = useParams<{ uid: string }>()
  const [account, setAccount] = useState<UserAccount | null>(null)
  // 기록을 지우면 현황을 다시 계산해야 해서 원본을 들고 있는다.
  const [sets, setSets] = useState<VocabSet[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /** 점수를 손으로 넣는 중인 시험지 id. 종이로 본 결과를 옮겨 적을 때 쓴다. */
  const [manualFor, setManualFor] = useState<string | null>(null)
  const [manualCorrect, setManualCorrect] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  /** 지난 결과표를 붙여넣는 칸. 비어 있으면 '맞은 개수' 만으로 기록한다. */
  const [manualPaste, setManualPaste] = useState('')

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    Promise.all([getAccount(uid), listVocabSets(), listAttemptsForUser(uid)])
      .then(([acc, all, atts]) => {
        if (cancelled) return
        if (!acc) {
          setError('학생을 찾을 수 없습니다.')
          return
        }
        // 시험지는 교재 공용이다. 병합 전 옛 시험지의 소유자와, 교재에서
        // 지정한 공개 대상만 걸러 이 학생이 실제로 보는 목록을 만든다.
        const sets = all.filter(
          (s) =>
            (!s.studentUid || s.studentUid === uid) && isVisibleToStudent(s, uid),
        )
        // DAY 번호 순. 만든 순서로 두면 DAY 10 이 DAY 2 앞에 온다.
        const sorted = [...sets].sort((a, b) =>
          a.title.localeCompare(b.title, 'ko', { numeric: true }),
        )
        setAccount(acc)
        setSets(sorted)
        setAttempts(atts)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const rows = useMemo(() => sheetStatuses(sets, attempts), [sets, attempts])
  const summary = useMemo(
    () => summarizeVocab(rows, VOCAB_PASS_THRESHOLD),
    [rows],
  )

  /**
   * 응시 기록 삭제. 정식 응시를 지우면 응시 횟수 제한이 그만큼 풀리므로,
   * 다시 풀게 해 주려고 지우는 쓰임이 많다.
   */
  async function handleDeleteAttempt(a: Attempt, sheetTitle: string) {
    if (
      !window.confirm(
        `${sheetTitle}\n${formatDate(a.createdAt) || '날짜 없음'} · ${a.correct}/${a.total} 기록을 삭제하시겠습니까?\n` +
          (a.practice
            ? '연습 기록이라 응시 횟수에는 영향이 없습니다.'
            : '응시 횟수 제한이 있으면 학생이 한 번 더 풀 수 있게 됩니다.'),
      )
    )
      return
    setDeletingId(a.id)
    try {
      await deleteAttempt(a.id)
      setAttempts((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록 삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  const parsedPaste = useMemo(
    () => (manualPaste.trim() ? parseVocabResultTable(manualPaste) : null),
    [manualPaste],
  )

  async function handleManualSave(set: VocabSet) {
    if (!account) return
    const rows = parsedPaste?.rows ?? []
    const setTotal = set.words?.length ?? 0
    let total = setTotal
    let n = 0
    if (rows.length > 0) {
      // 붙여넣은 표가 있으면 그것이 곧 문항 수다. 시험지 단어 수와 달라도
      // (문항 범위를 좁혀 봤거나 교재가 그 뒤 바뀌었거나) 본 대로 남긴다.
      total = rows.length
      n = rows.filter((r) => r.correct).length
    } else {
      n = Number.parseInt(manualCorrect, 10)
      if (!Number.isFinite(n) || n < 0 || n > setTotal) {
        setError(`맞은 개수는 0 ~ ${setTotal} 사이여야 합니다.`)
        return
      }
    }
    setManualSaving(true)
    setError(null)
    try {
      const id = await createManualVocabAttempt({
        studentUid: account.id,
        studentName: account.displayName,
        refId: set.id,
        refTitle: set.title,
        vocabResults: rows.length > 0 ? rows : undefined,
        total,
        correct: n,
      })
      // 목록을 다시 읽지 않고 로컬에 얹는다. createdAt 은 서버 시각이라
      // 아직 모르지만, 화면에서는 '방금' 자리에 두면 된다.
      setAttempts((prev) => [
        {
          id,
          studentUid: account.id,
          studentName: account.displayName,
          type: 'vocab',
          refId: set.id,
          refTitle: set.title,
          total,
          correct: n,
          manual: true,
          ...(rows.length > 0 ? { vocabResults: rows } : {}),
          createdAt: null,
        },
        ...prev,
      ])
      setManualFor(null)
      setManualCorrect('')
      setManualPaste('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '결과 입력 실패')
    } finally {
      setManualSaving(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!account) return null

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <BackLink to="/vocab" label="학생 목록" />

      <header className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {account.displayName}
            <span className="ml-2 text-sm font-normal text-slate-500">
              단어 시험 현황
            </span>
          </h1>
          {account.school && (
            <p className="text-sm text-slate-500 mt-1">{account.school}</p>
          )}
        </div>
        <Link
          to={`/admin/students/${account.id}`}
          className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          학생 상세 · 과제 부여
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="시험지" value={String(summary.total)} />
        <StatBox
          label="응시"
          value={`${summary.taken}`}
          sub={summary.untaken > 0 ? `미응시 ${summary.untaken}` : undefined}
        />
        <StatBox
          label={`기준 통과 (${VOCAB_PASS_THRESHOLD}개↑)`}
          value={String(summary.passed)}
        />
        <StatBox
          label="평균 정답률"
          value={summary.avgRate === null ? '—' : `${summary.avgRate}%`}
          tone={rateTone(summary.avgRate)}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          이 학생의 단어 시험지가 없습니다.{' '}
          <Link to="/vocab/corpora" className="text-brand-700 underline">
            교재에서 DAY 시험지 만들기
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.set.id}
              className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/vocab/${r.set.id}`}
                    className="font-medium text-slate-900 hover:underline break-keep"
                  >
                    {r.set.title}
                  </Link>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {r.set.words?.length ?? 0}단어
                    {r.set.format === 'choice' ? ' · 5지선다' : ' · 주관식'}
                    {r.practiceTries.length > 0 &&
                      ` · 연습 ${r.practiceTries.length}회`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {r.best ? (
                    <>
                      <p className={`text-base font-semibold ${rateTone(r.bestRate)}`}>
                        {r.best.correct}/{r.best.total}
                        {r.bestRate !== null && (
                          <span className="ml-1 text-xs font-normal">
                            ({r.bestRate}%)
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {r.tries.length}회 응시 · 최고점
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-block rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium px-2 py-0.5">
                        미응시
                      </span>
                      {manualFor !== r.set.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualFor(r.set.id)
                            setManualCorrect('')
                            setManualPaste('')
                          }}
                          className="text-[11px] text-brand-700 hover:underline"
                        >
                          결과 입력
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 앱에서 풀지 않고 종이로 본 결과를 옮겨 적는 자리 */}
              {manualFor === r.set.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      지난 결과표 붙여넣기{' '}
                      <span className="text-slate-400">
                        (영단어 · 내 답 · 정답 · 결과 순서. 머리글이 있어도 됩니다)
                      </span>
                    </label>
                    <textarea
                      value={manualPaste}
                      onChange={(e) => setManualPaste(e.target.value)}
                      rows={4}
                      autoFocus
                      placeholder={'1\nsharpen\n날을 갈다\n날카롭게 하다\n정답\n…'}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    {parsedPaste && (
                      <p className="text-[11px] mt-1">
                        {parsedPaste.rows.length > 0 ? (
                          <span className="text-brand-700">
                            {parsedPaste.rows.length}문항 인식 · 정답{' '}
                            {parsedPaste.rows.filter((x) => x.correct).length}개
                            {parsedPaste.rows.length !== (r.set.words?.length ?? 0) &&
                              ` (시험지는 ${r.set.words?.length ?? 0}단어)`}
                          </span>
                        ) : (
                          <span className="text-amber-700">
                            읽어낸 문항이 없습니다. 각 줄 끝이 정답/오답인지 확인하세요.
                          </span>
                        )}
                        {parsedPaste.skipped > 0 && (
                          <span className="text-amber-700">
                            {' '}· 건너뛴 줄 {parsedPaste.skipped}개
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* 표가 없을 때만 점수로 받는다 — 둘 다 넣으면 뭐가 이겼는지 헷갈린다 */}
                  {(parsedPaste?.rows.length ?? 0) === 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-[11px] text-slate-500">
                        표가 없으면 맞은 개수만
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={r.set.words?.length ?? 0}
                        value={manualCorrect}
                        onChange={(e) => setManualCorrect(e.target.value)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <span className="text-[11px] text-slate-400">
                        / {r.set.words?.length ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        · 어느 단어를 틀렸는지는 기록되지 않습니다
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleManualSave(r.set)}
                      disabled={manualSaving}
                      className="rounded-md bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {manualSaving ? '저장 중…' : '저장'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualFor(null)}
                      className="text-[11px] text-slate-500 hover:text-slate-900"
                    >
                      취소
                    </button>
                    <span className="text-[10px] text-slate-400">
                      앱에서 푼 기록이 아니라 옮겨 적은 기록으로 표시됩니다.
                    </span>
                  </div>
                </div>
              )}

              {/* 연습도 함께 — 지울 수 있어야 하므로 목록에 낸다 */}
              {[...r.tries, ...r.practiceTries].length > 0 && (
                <ul className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1">
                  {[...r.tries, ...r.practiceTries].map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 shrink-0">
                        {formatDate(a.createdAt) || '날짜 없음'}
                      </span>
                      {a.practice && (
                        <span className="shrink-0 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 text-[10px]">
                          연습
                        </span>
                      )}
                      {/* 점수만 옮겨 적은 기록. 앱에서 푼 것과 구분한다. */}
                      {a.manual && (
                        <span className="shrink-0 rounded bg-slate-100 text-slate-600 border border-slate-200 px-1 py-0.5 text-[10px]">
                          수동 입력
                        </span>
                      )}
                      <span className="text-slate-600">
                        {a.correct}/{a.total}
                      </span>
                      <Link
                        to={`/vocab/${r.set.id}/result/${a.id}`}
                        className="ml-auto shrink-0 text-slate-500 hover:text-slate-900 underline underline-offset-2"
                      >
                        보기
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttempt(a, r.set.title)}
                        disabled={deletingId === a.id}
                        className="shrink-0 text-slate-400 hover:text-red-600 underline underline-offset-2 disabled:opacity-50"
                      >
                        {deletingId === a.id ? '삭제 중…' : '삭제'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-amber-700">{sub}</p>}
    </div>
  )
}
