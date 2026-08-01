import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  clearAllVocabAttemptLimits,
  deleteVocabSet,
  formatDate,
  listVocabSeries,
  listVocabSets,
  updateVocabSetWords,
} from '../lib/firestore'
import {
  isVisibleToStudent,
  type VocabSense,
  type VocabSeries,
  type VocabSet,
  type WordEntry,
} from '../lib/types'
import { parseSenseBody } from '../lib/parseTextbookVocab'
import { groupBySeries } from '../lib/vocabGroups'

/** 시험지 한 줄. 교재 안(DAY 라벨 있음)과 기타 목록에서 같이 쓴다. */
function SetRow({
  set: s,
  label,
  canManage,
  deleting,
  onDelete,
}: {
  set: VocabSet
  label?: string
  canManage: boolean
  deleting: boolean
  onDelete: (e: React.MouseEvent, s: VocabSet) => void
}) {
  return (
    <li className="relative">
      <Link
        to={`/vocab/${s.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100"
      >
        <div className="min-w-0 flex items-center gap-3">
          {label && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-11 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-1">
              {label}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-slate-900 truncate">{s.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {s.words.length}단어 · {formatDate(s.createdAt)}
              {s.format === 'choice' ? ' · 5지선다' : ''}
              {/* 소유자가 남아 있으면 아직 병합 안 된 옛 시험지다 */}
              {canManage && s.studentName && (
                <span className="text-amber-600"> · {s.studentName} (병합 전)</span>
              )}
              {/* 교재에서 공개 대상을 지정한 시험지 */}
              {canManage && s.studentUids && s.studentUids.length > 0 && (
                <span className="text-brand-700"> · 지정 {s.studentUids.length}명</span>
              )}
            </p>
          </div>
        </div>
        <span className="text-slate-300 text-lg shrink-0">→</span>
      </Link>
      {canManage && (
        <button
          type="button"
          onClick={(e) => onDelete(e, s)}
          disabled={deleting}
          className="absolute top-2 right-9 text-[10px] text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded disabled:opacity-50"
          aria-label="삭제"
        >
          {deleting ? '…' : '삭제'}
        </button>
      )}
    </li>
  )
}

export function VocabList({ manage = false }: { manage?: boolean }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canManage = isAdmin && manage
  const [sets, setSets] = useState<VocabSet[]>([])
  const [series, setSeries] = useState<VocabSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /** 펼쳐 둔 교재. 교재가 여러 개면 한 화면에 다 펼치면 너무 길다. */
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const { groups, loose } = useMemo(
    () => groupBySeries(series, sets),
    [series, sets],
  )
  const allOpen = groups.length > 0 && groups.every((g) => openIds.has(g.series.id))

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!profile) return
    // 시험지는 교재마다 하나씩이라 기본은 모두에게 보인다. 두 가지만 걸러낸다.
    // 1) 병합 전 옛 시험지에 남아 있는 소유자(studentUid)
    // 2) 교재에서 지정한 공개 대상(studentUids) — 없으면 전체 공개
    // 관리 뷰는 전부 본다. (관리자는 /vocab 에서 VocabHome 이 학생 목록으로
    // 보내므로 여기 안 온다.)
    Promise.all([listVocabSets(), listVocabSeries()])
      .then(([all, allSeries]) => {
        const mine = canManage
          ? all
          : all.filter(
              (s) =>
                (!s.studentUid || s.studentUid === profile.id) &&
                isVisibleToStudent(s, profile.id),
            )
        setSets(
          [...mine].sort((a, b) =>
            a.title.localeCompare(b.title, 'ko', { numeric: true, sensitivity: 'base' }),
          ),
        )
        setSeries(allSeries)
      })
      .catch((e) => setError(e.message ?? '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [profile, canManage])

  function reprocessWord(w: WordEntry): WordEntry {
    if (!w.senses || w.senses.length === 0) return w
    const newSenses: VocabSense[] = w.senses.map((s) => {
      const parts: string[] = []
      if (s.ko) parts.push(s.ko)
      if (s.definitionEn) parts.push(`[${s.definitionEn}]`)
      if (s.synonyms && s.synonyms.length > 0)
        parts.push(`= ${s.synonyms.join(', ')}`)
      const body = parts.join(' ')
      const parsed = parseSenseBody(body)
      const cs: VocabSense = { ko: parsed.ko || s.ko }
      if (s.pos) cs.pos = s.pos
      if (parsed.definitionEn) cs.definitionEn = parsed.definitionEn
      if (parsed.synonyms && parsed.synonyms.length > 0) cs.synonyms = parsed.synonyms
      if (s.examples && s.examples.length > 0) cs.examples = s.examples
      return cs
    })
    const first = newSenses[0]
    const next: WordEntry = { ...w, ko: first.ko, senses: newSenses }
    if (first.pos) next.pos = first.pos
    if (first.definitionEn) next.definitionEn = first.definitionEn
    else delete next.definitionEn
    if (first.synonyms && first.synonyms.length > 0) next.synonyms = first.synonyms
    else delete next.synonyms
    return next
  }

  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessNotice, setReprocessNotice] = useState<string | null>(null)
  const [clearingLimits, setClearingLimits] = useState(false)

  async function handleClearAllLimits() {
    if (!isAdmin) return
    if (
      !window.confirm(
        '모든 단어 시험지·교재의 응시 횟수 제한을 해제합니다. 이후 시험지/교재 편집 페이지에서 다시 설정할 수 있습니다. 계속할까요?',
      )
    )
      return
    setClearingLimits(true)
    setReprocessNotice(null)
    try {
      const { vocabSets, vocabSeries } = await clearAllVocabAttemptLimits()
      setReprocessNotice(
        `응시 횟수 제한 해제: 시험지 ${vocabSets}개 · 교재 ${vocabSeries}개`,
      )
      // 로컬 상태도 즉시 반영 (sets에서 maxAttempts 제거)
      setSets((prev) =>
        prev.map((s) => {
          if (s.maxAttempts === undefined) return s
          const { maxAttempts: _omit, ...rest } = s
          void _omit
          return rest
        }),
      )
    } catch (err) {
      setReprocessNotice(err instanceof Error ? err.message : '해제 실패')
    } finally {
      setClearingLimits(false)
    }
  }

  async function handleReprocessAll() {
    if (!isAdmin) return
    if (
      !window.confirm(
        `${sets.length}개 시험지의 단어를 새 파서로 다시 정리합니다. 시험 결과는 그대로 둡니다. 계속하시겠습니까?`,
      )
    )
      return
    setReprocessing(true)
    setReprocessNotice(null)
    let touched = 0
    try {
      for (const s of sets) {
        if (!s.words || s.words.length === 0) continue
        const updated = s.words.map(reprocessWord)
        await updateVocabSetWords(s.id, updated)
        touched++
      }
      setReprocessNotice(`${touched}개 시험지의 단어 재분석 완료.`)
    } catch (err) {
      setReprocessNotice(err instanceof Error ? err.message : '재분석 실패')
    } finally {
      setReprocessing(false)
    }
  }

  async function handleDelete(e: React.MouseEvent, s: VocabSet) {
    e.preventDefault()
    e.stopPropagation()
    if (
      !window.confirm(
        `"${s.title}" 시험지를 삭제하시겠습니까?\n교재에서 만든 DAY 시험지면 진행도도 함께 되돌아가, 같은 번호로 다시 만들 수 있습니다.`,
      )
    )
      return
    setDeletingId(s.id)
    try {
      await deleteVocabSet(s)
      setSets((prev) => prev.filter((x) => x.id !== s.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {manage ? '관리' : '학습'}
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {manage ? '단어 시험지 관리' : '단어 시험지'}
          </h1>
        </div>
        {canManage && (
          <div className="flex gap-1.5 flex-wrap">
            <Link
              to="/admin/vocab/merge"
              className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
            >
              중복 병합
            </Link>
            <button
              type="button"
              onClick={handleClearAllLimits}
              disabled={clearingLimits}
              className="rounded-md border border-amber-200 text-amber-700 text-xs font-medium px-3 py-1.5 hover:bg-amber-50 disabled:opacity-50"
            >
              {clearingLimits ? '해제 중…' : '응시 횟수 제한 전부 해제'}
            </button>
            <button
              type="button"
              onClick={handleReprocessAll}
              disabled={reprocessing}
              className="rounded-md border border-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {reprocessing ? '재분석 중…' : '단어 재분석'}
            </button>
            {/* 시험지는 교재에서만 만든다 — 붙여넣기로 만드는 별도 경로는 없앴다. */}
            <button
              type="button"
              onClick={() =>
                setOpenIds(allOpen ? new Set() : new Set(groups.map((g) => g.series.id)))
              }
              disabled={groups.length === 0}
              className="rounded-md border border-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {allOpen ? '전체 접기' : '전체 펼치기'}
            </button>
            <Link
              to="/vocab/corpora"
              className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800"
            >
              + 교재에서 만들기
            </Link>
          </div>
        )}
      </header>

      {reprocessNotice && (
        <p className="text-xs text-brand-700">{reprocessNotice}</p>
      )}
      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && sets.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          등록된 시험지가 없어요.
        </div>
      )}

      {/* 교재별로 접어 둔다. 교재가 여러 개면 한 화면에 다 펼치면 너무 길다. */}
      <div className="space-y-2">
        {groups.map(({ series: sr, days }) => {
          const open = openIds.has(sr.id)
          return (
            <section
              key={sr.id}
              className="rounded-lg border border-slate-200 bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleOpen(sr.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">
                    {sr.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    시험지 {days.length}개 · DAY {days[0].day}
                    {days.length > 1 && `~${days[days.length - 1].day}`}
                  </p>
                </div>
                <span className="shrink-0 text-slate-400 text-sm">
                  {open ? '−' : '+'}
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {days.map(({ day, set }) => (
                    <SetRow
                      key={set.id}
                      label={`DAY ${day}`}
                      set={set}
                      canManage={canManage}
                      deleting={deletingId === set.id}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {/* 교재에 안 붙는 옛 시험지. 묶을 데가 없다고 사라지면 안 된다. */}
      {loose.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">기타 시험지</h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {loose.map((s) => (
              <SetRow
                key={s.id}
                set={s}
                canManage={canManage}
                deleting={deletingId === s.id}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
