import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import {
  listAllAttempts,
  listVocabSeries,
  listVocabSets,
  mergeVocabSets,
  progressFromSets,
  updateVocabSeries,
} from '../lib/firestore'
import { buildMergeGroups, type MergeGroup } from '../lib/vocabMerge'

/**
 * 학생마다 따로 만들어 두었던 같은 시험지를 하나로 합치는 일회성 도구.
 *
 * 시험지가 교재 공용으로 바뀌기 전에 만든 것들이 대상이다. 합치기 전까지는
 * 같은 DAY 가 학생 수만큼 보이고, 학생에게도 자기 것만 보인다.
 */
export function AdminVocabMerge() {
  const [groups, setGroups] = useState<MergeGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())

  async function reload() {
    const [sets, attempts] = await Promise.all([listVocabSets(), listAllAttempts()])
    setGroups(buildMergeGroups(sets, attempts))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listVocabSets(), listAllAttempts()])
      .then(([sets, attempts]) => {
        if (!cancelled) setGroups(buildMergeGroups(sets, attempts))
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
  }, [])

  const pending = useMemo(() => groups.filter((g) => !done.has(g.title)), [groups, done])
  const safe = useMemo(
    () => pending.filter((g) => !g.conflict && !g.hasAttempts),
    [pending],
  )
  const withAttempts = useMemo(
    () => pending.filter((g) => !g.conflict && g.hasAttempts),
    [pending],
  )
  const conflicts = useMemo(() => pending.filter((g) => g.conflict), [pending])

  /**
   * 합친 뒤 교재 진행도를 다시 맞춘다 — 시험지가 줄었으니 커서도 달라진다.
   * 교재마다 syncVocabSeriesProgress 를 부르면 시험지 전체를 교재 수만큼
   * 다시 읽는다. 한 번만 읽어서 돌려 쓴다.
   */
  async function resyncSeries() {
    const [sets, allSeries] = await Promise.all([listVocabSets(), listVocabSeries()])
    for (const s of allSeries) {
      try {
        await updateVocabSeries(s.id, progressFromSets(s, sets))
      } catch {
        // 교재 하나가 실패해도 나머지는 맞춘다
      }
    }
  }

  async function runMerge(targets: MergeGroup[], label: string) {
    setBusy(true)
    setNotice(null)
    let merged = 0
    let deleted = 0
    let moved = 0
    const finished = new Set(done)
    try {
      for (const g of targets) {
        const losers = g.sets.filter((s) => s.id !== g.survivor.id)
        const r = await mergeVocabSets(g.survivor, losers)
        merged++
        deleted += r.deleted
        moved += r.attempts + r.assignments
        finished.add(g.title)
      }
      await resyncSeries()
      await reload()
      setNotice(
        `${label} ${merged}개 묶음 병합 완료 · 시험지 ${deleted}개 삭제 · 응시·과제 ${moved}건을 남은 시험지로 옮겼습니다.`,
      )
    } catch (err) {
      setNotice(
        (err instanceof Error ? err.message : '병합 실패') +
          (merged > 0 ? ` (${merged}개 묶음까지는 병합됨)` : ''),
      )
    } finally {
      setDone(finished)
      setBusy(false)
    }
  }

  function mergeSafe() {
    if (safe.length === 0) return
    if (
      !window.confirm(
        `응시 기록이 없는 ${safe.length}개 묶음을 병합합니다.\n각 묶음에서 하나만 남기고 나머지 시험지를 삭제합니다.\n계속할까요?`,
      )
    )
      return
    void runMerge(safe, '기록 없는')
  }

  function mergeOne(g: MergeGroup) {
    const total = g.attemptCounts.reduce((n, c) => n + c, 0)
    if (
      !window.confirm(
        `"${g.title}" 시험지 ${g.sets.length}개를 하나로 합칩니다.\n` +
          `응시 기록 ${total}건은 남는 시험지로 옮겨집니다 (기록은 사라지지 않습니다).\n` +
          `나머지 시험지 ${g.sets.length - 1}개는 삭제됩니다. 계속할까요?`,
      )
    )
      return
    void runMerge([g], '')
  }

  function mergeAllWithAttempts() {
    if (withAttempts.length === 0) return
    const total = withAttempts.reduce(
      (n, g) => n + g.attemptCounts.reduce((m, c) => m + c, 0),
      0,
    )
    if (
      !window.confirm(
        `응시 기록이 있는 ${withAttempts.length}개 묶음을 모두 병합합니다.\n` +
          `응시 기록 ${total}건은 남는 시험지로 옮겨집니다 (기록은 사라지지 않습니다).\n` +
          `계속할까요?`,
      )
    )
      return
    void runMerge(withAttempts, '기록 있는')
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <BackLink to="/admin" label="관리" />

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          중복 시험지 병합
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          시험지를 학생마다 따로 만들던 때의 사본을 하나로 합칩니다. 제목이 같은
          것끼리 묶고, 남는 시험지로 응시 기록과 과제를 옮긴 뒤 나머지를
          삭제합니다.
        </p>
      </header>

      {notice && (
        <p className="rounded-md bg-brand-50 text-brand-700 text-sm px-3 py-2">
          {notice}
        </p>
      )}

      {pending.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          합칠 중복 시험지가 없습니다. 모든 시험지가 이미 하나씩입니다.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-2">
            <p className="text-sm text-slate-700">
              중복 묶음 <strong>{pending.length}개</strong> · 기록 없음{' '}
              <strong>{safe.length}</strong> · 기록 있음{' '}
              <strong>{withAttempts.length}</strong> · 충돌{' '}
              <strong>{conflicts.length}</strong>
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={mergeSafe}
                disabled={busy || safe.length === 0}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? '병합 중…' : `기록 없는 ${safe.length}개 묶음 병합`}
              </button>
              <button
                type="button"
                onClick={mergeAllWithAttempts}
                disabled={busy || withAttempts.length === 0}
                className="rounded-md border border-amber-300 bg-white text-amber-800 text-sm font-medium px-4 py-2 hover:bg-amber-50 disabled:opacity-50"
              >
                기록 있는 {withAttempts.length}개 묶음 모두 병합
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              충돌 묶음은 어느 버튼으로도 합치지 않습니다. 아래에서 직접 확인하세요.
            </p>
          </section>

          <ul className="space-y-2">
            {pending.map((g) => {
              const total = g.attemptCounts.reduce((n, c) => n + c, 0)
              return (
                <li
                  key={g.title}
                  className={`rounded-xl border bg-white p-4 ${
                    g.conflict ? 'border-red-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 break-keep">
                        {g.title}
                        {g.conflict && (
                          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                            충돌
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        시험지 {g.sets.length}개 · 응시 기록 {total}건
                      </p>
                    </div>
                    {!g.conflict && (
                      <button
                        type="button"
                        onClick={() => mergeOne(g)}
                        disabled={busy}
                        className="shrink-0 rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                      >
                        병합
                      </button>
                    )}
                  </div>

                  <ul className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1">
                    {g.sets.map((s, i) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 text-xs text-slate-600"
                      >
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            s.id === g.survivor.id
                              ? 'bg-brand-100 text-brand-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {s.id === g.survivor.id ? '남김' : '삭제'}
                        </span>
                        <Link
                          to={`/vocab/${s.id}`}
                          className="min-w-0 truncate hover:underline"
                        >
                          {s.studentName || '(소유자 없음)'}
                        </Link>
                        <span className="ml-auto shrink-0 text-slate-400">
                          {s.words?.length ?? 0}단어 · 응시 {g.attemptCounts[i]}건
                        </span>
                      </li>
                    ))}
                  </ul>

                  {g.conflict && (
                    <p className="mt-2 text-[11px] text-red-700">
                      담긴 단어가 서로 다릅니다. 그대로 합치면 한쪽 학생이 안 배운
                      단어를 받게 됩니다. 각 시험지를 열어 확인한 뒤, 남길 것만
                      두고 나머지를 직접 삭제하세요.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
