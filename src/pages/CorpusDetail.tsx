import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  createVocabSet,
  deleteVocabSeries,
  getVocabSeries,
  renameVocabSeriesSheets,
  updateVocabSeries,
} from '../lib/firestore'
import { listAccounts } from '../lib/account'
import {
  parseWordList,
  type UserAccount,
  type VocabFormat,
  type VocabSense,
  type VocabSeries,
  type WordEntry,
} from '../lib/types'
import { buildVocabChoices } from '../lib/vocabChoices'
import {
  looksLikeTextbookVocab,
  parseSenseBody,
  parseTextbookVocab,
} from '../lib/parseTextbookVocab'

export function CorpusDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [series, setSeries] = useState<VocabSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [perDayRaw, setPerDayRaw] = useState('30')
  /** 한 번에 만들 DAY 개수. 1이면 기존과 동일하게 한 개만. */
  const [dayCountRaw, setDayCountRaw] = useState('1')
  const [format, setFormat] = useState<VocabFormat>('written')
  // AI 오답 생성이 일부라도 실패했는지 — 교재 내 뜻으로 채워지므로 생성은 성공한다
  const [choiceWarning, setChoiceWarning] = useState(false)
  const [maxAttemptsRaw, setMaxAttemptsRaw] = useState('')
  const [students, setStudents] = useState<UserAccount[]>([])
  // 학생 상세에서 ?student= 로 넘어오면 그 학생을 미리 골라둔다
  const [search] = useSearchParams()
  const [genUid, setGenUid] = useState(search.get('student') ?? '')
  const [appendText, setAppendText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [appending, setAppending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editEn, setEditEn] = useState('')
  const [editKo, setEditKo] = useState('')
  const [editIpa, setEditIpa] = useState('')
  const [editPos, setEditPos] = useState('')
  const [editSynonymsRaw, setEditSynonymsRaw] = useState('')
  const [editDefinitionEn, setEditDefinitionEn] = useState('')
  const [editExample, setEditExample] = useState('')
  const [editExampleKo, setEditExampleKo] = useState('')

  useEffect(() => {
    if (!id) return
    getVocabSeries(id)
      .then((s) => {
        if (!s) setError('교재를 찾을 수 없습니다.')
        else {
          setSeries(s)
          if (s.perDay) setPerDayRaw(String(s.perDay))
          if (s.maxAttempts) setMaxAttemptsRaw(String(s.maxAttempts))
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    listAccounts()
      .then((accs) =>
        setStudents(
          accs
            .filter((a) => a.role === 'student' && a.status === 'active')
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko')),
        ),
      )
      .catch(() => {})
  }, [])

  const appendIsTextbook = useMemo(
    () => looksLikeTextbookVocab(appendText),
    [appendText],
  )
  const appendWords = useMemo<WordEntry[]>(() => {
    if (!appendText.trim()) return []
    return appendIsTextbook ? parseTextbookVocab(appendText) : parseWordList(appendText)
  }, [appendText, appendIsTextbook])

  const total = series?.words?.length ?? 0
  // 선택 학생의 진행도 기준 (학생마다 독립적으로 DAY 생성).
  const genProg = (genUid && series?.studentProgress?.[genUid]) || {
    usedCount: 0,
    lastDayNumber: 0,
  }
  const used = genProg.usedCount
  const remaining = Math.max(0, total - used)
  const nextDay = genProg.lastDayNumber + 1
  // 남은 단어로 실제 만들 수 있는 DAY 수 (요청보다 적을 수 있다)
  const requestedDays = Math.max(1, Number.parseInt(dayCountRaw, 10) || 1)
  const perDayNum = Math.max(1, Number.parseInt(perDayRaw, 10) || 1)
  const plannedDays = Math.min(requestedDays, Math.ceil(remaining / perDayNum))

  async function handleGenerate() {
    if (!series || !profile) return
    if (!genUid) {
      setNotice('시험지를 만들 학생을 선택하세요.')
      return
    }
    const student = students.find((s) => s.id === genUid)
    const perDay = Number.parseInt(perDayRaw, 10)
    if (!Number.isFinite(perDay) || perDay <= 0) {
      setNotice('DAY당 단어 수는 양의 정수여야 합니다.')
      return
    }
    const requested = Number.parseInt(dayCountRaw, 10)
    if (!Number.isFinite(requested) || requested <= 0) {
      setNotice('만들 DAY 수는 양의 정수여야 합니다.')
      return
    }
    const allWords = series.words ?? []
    if (remaining <= 0) {
      setNotice('이 학생은 교재 단어를 모두 사용했습니다. 단어를 추가하세요.')
      return
    }
    let maxAttempts: number | undefined
    if (maxAttemptsRaw.trim()) {
      const n = Number.parseInt(maxAttemptsRaw, 10)
      if (Number.isFinite(n) && n > 0) maxAttempts = n
    }
    // 남은 단어보다 많이 요청하면 남은 만큼만 만든다
    const count = Math.min(requested, Math.ceil(remaining / perDay))

    setGenerating(true)
    setNotice(null)
    setChoiceWarning(false)

    // 진행도는 DAY 하나를 만들 때마다 갱신한다. 마지막에 한 번만 쓰면
    // 중간에 실패했을 때 이미 만들어진 시험지가 진행도에 안 잡혀,
    // 다음 생성이 같은 단어를 또 내보낸다.
    let cursor = used
    let day = nextDay
    let madeDays = 0
    let madeWords = 0
    try {
      for (let i = 0; i < count; i++) {
        const slice = allWords.slice(cursor, Math.min(cursor + perDay, allWords.length))
        if (slice.length === 0) break

        // 5지선다는 만들 때 선지를 한 번 생성해 저장한다.
        // 오답은 이 DAY 안이 아니라 교재 전체에서 빌려온다 — DAY 안에서만
        // 뽑으면 30단어짜리 DAY에서 같은 오답이 계속 반복된다.
        let choiceSets
        if (format === 'choice') {
          setNotice(`${i + 1}/${count} DAY ${day} 선지 생성 중...`)
          const built = await buildVocabChoices(slice, allWords)
          choiceSets = built.choiceSets
          if (built.aiFailed) setChoiceWarning(true)
        } else if (count > 1) {
          setNotice(`${i + 1}/${count} DAY ${day} 생성 중...`)
        }

        await createVocabSet({
          title: `${series.title} DAY ${day}`,
          words: slice,
          maxAttempts,
          studentUid: genUid,
          studentName: student?.displayName ?? '',
          format,
          choiceSets,
          // 삭제할 때 진행도를 되돌리려면 어느 교재의 몇 번째 DAY 가
          // 어느 구간을 썼는지 시험지에 남아 있어야 한다.
          seriesId: series.id,
          dayNumber: day,
          wordStart: cursor,
          wordEnd: cursor + slice.length,
          createdBy: profile.id,
          createdByName: profile.displayName,
        })

        cursor += slice.length
        madeWords += slice.length
        madeDays++
        await updateVocabSeries(series.id, {
          studentProgress: {
            ...(series.studentProgress ?? {}),
            [genUid]: { usedCount: cursor, lastDayNumber: day },
          },
          perDay,
          maxAttempts,
        })
        day++
      }

      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      const range =
        madeDays === 1 ? `DAY ${nextDay}` : `DAY ${nextDay}~${nextDay + madeDays - 1}`
      setNotice(
        `${student?.displayName} · "${series.title}" ${range} ${madeDays}개 · ${madeWords}단어 생성 완료.` +
          (madeDays < requested ? ' (남은 단어만큼만 만들었습니다)' : ''),
      )
    } catch (err) {
      // 실패해도 여기까지 만든 것은 진행도에 반영돼 있다
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      const done = madeDays > 0 ? ` (${madeDays}개까지는 생성됨)` : ''
      setNotice((err instanceof Error ? err.message : '생성 실패') + done)
    } finally {
      setGenerating(false)
    }
  }

  async function handleAppend() {
    if (!series) return
    if (appendWords.length === 0) {
      setNotice('추가할 단어가 없습니다.')
      return
    }
    setAppending(true)
    setNotice(null)
    try {
      const merged = [...(series.words ?? []), ...appendWords]
      await updateVocabSeries(series.id, { words: merged })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setAppendText('')
      setNotice(`${appendWords.length}단어를 교재에 추가했습니다.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setAppending(false)
    }
  }

  function startEdit(i: number) {
    if (!series) return
    const w = series.words?.[i]
    if (!w) return
    const first = w.senses?.[0]
    setEditingIdx(i)
    setEditEn(w.en)
    setEditKo(first?.ko ?? w.ko)
    setEditIpa(w.ipa ?? '')
    setEditPos(first?.pos ?? w.pos ?? '')
    const syns = first?.synonyms?.length ? first.synonyms : w.synonyms
    setEditSynonymsRaw(syns ? syns.join(', ') : '')
    setEditDefinitionEn(first?.definitionEn ?? w.definitionEn ?? '')
    const ex0 = first?.examples?.[0]
    setEditExample(ex0?.en ?? w.example ?? '')
    setEditExampleKo(ex0?.ko ?? w.exampleKo ?? '')
  }

  function cancelEdit() {
    setEditingIdx(null)
    setEditEn('')
    setEditKo('')
    setEditIpa('')
    setEditPos('')
    setEditSynonymsRaw('')
    setEditDefinitionEn('')
    setEditExample('')
    setEditExampleKo('')
  }

  async function saveEdit(i: number) {
    if (!series) return
    const newEn = editEn.trim()
    const newKo = editKo.trim()
    if (!newEn || !newKo) {
      setNotice('영단어와 한국어 뜻을 모두 입력하세요.')
      return
    }
    const ipa = editIpa.trim()
    const pos = editPos.trim()
    const synonyms = editSynonymsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const definitionEn = editDefinitionEn.trim()
    const example = editExample.trim()
    const exampleKo = editExampleKo.trim()

    const updated = [...(series.words ?? [])]
    const prev = updated[i]
    const next: WordEntry = { en: newEn, ko: newKo }
    if (ipa) next.ipa = ipa
    if (pos) next.pos = pos
    if (synonyms.length > 0) next.synonyms = synonyms
    if (definitionEn) next.definitionEn = definitionEn
    if (example) next.example = example
    if (exampleKo) next.exampleKo = exampleKo

    if (prev.senses && prev.senses.length > 0) {
      const senses = prev.senses.map((s, idx) => {
        if (idx !== 0) return s
        const examples =
          example || exampleKo
            ? [{ en: example, ...(exampleKo ? { ko: exampleKo } : {}) }]
            : []
        const sense: typeof s = { ko: newKo }
        if (pos) sense.pos = pos
        if (definitionEn) sense.definitionEn = definitionEn
        if (synonyms.length > 0) sense.synonyms = synonyms
        if (examples.length > 0) sense.examples = examples
        return sense
      })
      next.senses = senses
    }

    updated[i] = next
    try {
      await updateVocabSeries(series.id, { words: updated })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      cancelEdit()
      setNotice('수정되었습니다.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '저장 실패')
    }
  }

  async function deleteWord(i: number) {
    if (!series) return
    const w = series.words?.[i]
    if (!w) return
    if (!window.confirm(`"${w.en}" 단어를 교재에서 삭제하시겠습니까?`)) return
    const updated = [...(series.words ?? [])]
    updated.splice(i, 1)
    const newUsed = i < used ? Math.max(0, used - 1) : used
    try {
      await updateVocabSeries(series.id, {
        words: updated,
        usedCount: newUsed,
      })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setNotice('삭제되었습니다.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '삭제 실패')
    }
  }

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
      if (parsed.synonyms && parsed.synonyms.length > 0)
        cs.synonyms = parsed.synonyms
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

  async function handleReprocess() {
    if (!series) return
    if (
      !window.confirm(
        `교재의 ${series.words?.length ?? 0}개 단어를 새 파서로 다시 정리합니다. 계속하시겠습니까?`,
      )
    )
      return
    setNotice(null)
    try {
      const updated = (series.words ?? []).map(reprocessWord)
      await updateVocabSeries(series.id, { words: updated })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setNotice('단어 재분석 완료.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '재분석 실패')
    }
  }

  function startRenameTitle() {
    if (!series) return
    setTitleDraft(series.title)
    setRenamingTitle(true)
  }

  async function handleRenameTitle() {
    if (!series) return
    const next = titleDraft.trim()
    if (!next) {
      setNotice('교재명을 입력하세요.')
      return
    }
    if (next === series.title) {
      setRenamingTitle(false)
      return
    }
    setSavingTitle(true)
    setNotice(null)
    try {
      const oldTitle = series.title
      // 교재명은 이미 시험지를 생성했더라도 언제든 변경 가능.
      await updateVocabSeries(series.id, { title: next })
      const renamed = await renameVocabSeriesSheets(oldTitle, next)
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setRenamingTitle(false)
      setNotice(
        renamed > 0
          ? `교재명을 변경했습니다. 생성된 DAY 시험지 ${renamed}개 제목도 함께 변경됨.`
          : '교재명을 변경했습니다.',
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '이름 변경 실패')
    } finally {
      setSavingTitle(false)
    }
  }

  async function handleDelete() {
    if (!series) return
    if (
      !window.confirm(
        `"${series.title}" 교재를 삭제하시겠습니까?\n이미 생성된 DAY 시험지는 그대로 남습니다.`,
      )
    )
      return
    await deleteVocabSeries(series.id)
    navigate('/vocab/corpora')
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!series) return null

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/vocab/corpora"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← 교재 관리
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-1 mb-1">
            교재
          </p>
          {renamingTitle ? (
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleRenameTitle()
                  } else if (e.key === 'Escape') {
                    setRenamingTitle(false)
                  }
                }}
                className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => void handleRenameTitle()}
                disabled={savingTitle}
                className="shrink-0 rounded-md bg-brand-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
              >
                {savingTitle ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => setRenamingTitle(false)}
                className="shrink-0 rounded-md border border-slate-300 text-slate-600 text-sm px-2.5 py-1.5 hover:bg-slate-100"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
                {series.title}
              </h1>
              <button
                type="button"
                onClick={startRenameTitle}
                className="shrink-0 text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
              >
                이름 변경
              </button>
            </div>
          )}
          <p className="text-sm text-slate-500 mt-1">
            교재 전체 {total}단어 · 학생마다 DAY 시험지를 따로 생성
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleReprocess}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-100"
            title="옛 파서로 잘못 갈라진 단어를 새 파서로 재정리"
          >
            단어 재분석
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-200 text-red-600 text-sm font-medium px-3 py-1.5 hover:bg-red-50"
          >
            교재 삭제
          </button>
        </div>
      </div>

      {notice && (
        <p className="rounded-md bg-brand-50 text-brand-700 text-sm px-3 py-2">
          {notice}
        </p>
      )}
      {choiceWarning && (
        <p className="text-sm text-amber-700">
          일부 단어는 AI 오답 생성에 실패해 이 교재의 다른 단어 뜻으로 채웠습니다.
          시험지는 정상 생성됐습니다.
        </p>
      )}

      <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-brand-700">
          학생 DAY 시험지 만들기
        </h2>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            학생 <span className="text-red-500">*</span>
          </label>
          <select
            value={genUid}
            onChange={(e) => setGenUid(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">— 학생 선택 —</option>
            {students.map((s) => {
              const p = series.studentProgress?.[s.id]
              return (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                  {s.school ? ` (${s.school})` : ''}
                  {p ? ` · DAY ${p.lastDayNumber}까지` : ''}
                </option>
              )
            })}
          </select>
        </div>
        <div>
          <p className="block text-xs font-medium text-slate-600 mb-1.5">시험 형식</p>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-white p-1 max-w-xs">
            {(
              [
                { key: 'written', label: '주관식' },
                { key: 'choice', label: '5지선다' },
              ] as { key: VocabFormat; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFormat(opt.key)}
                className={`rounded px-2 py-1.5 touch:py-2 text-xs font-medium transition ${
                  format === opt.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {format === 'written'
              ? '학생이 뜻을 직접 입력하고 AI가 채점합니다.'
              : '단어마다 선지 5개를 만듭니다. 오답은 반대 뜻이나 철자가 비슷한 단어의 뜻으로, 부족하면 이 교재의 다른 뜻으로 채웁니다. 생성에 시간이 조금 걸립니다.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              DAY당 단어 수
            </label>
            <input
              type="number"
              min={1}
              value={perDayRaw}
              onChange={(e) => setPerDayRaw(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              만들 DAY 수{' '}
              <span className="font-normal text-slate-400">(한 번에)</span>
            </label>
            <input
              type="number"
              min={1}
              value={dayCountRaw}
              onChange={(e) => setDayCountRaw(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              응시 횟수 제한{' '}
              <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              type="number"
              min={1}
              value={maxAttemptsRaw}
              onChange={(e) => setMaxAttemptsRaw(e.target.value)}
              placeholder="예: 3"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        {genUid && (
          <p className="text-xs text-slate-600">
            이 학생: 사용 {used} · 남은 {remaining} ·{' '}
            {plannedDays <= 1 ? (
              <>
                다음 제목 <strong>{series.title} DAY {nextDay}</strong>
              </>
            ) : (
              <>
                만들 범위{' '}
                <strong>
                  DAY {nextDay}~{nextDay + plannedDays - 1}
                </strong>{' '}
                ({plannedDays}개)
              </>
            )}
            {plannedDays < requestedDays && (
              <span className="ml-2 text-amber-700">
                남은 단어로는 {plannedDays}개까지만 가능합니다
              </span>
            )}
          </p>
        )}
        {format === 'choice' && plannedDays > 1 && (
          <p className="text-[11px] text-amber-700">
            5지선다는 DAY마다 선지를 생성하므로 {plannedDays}개를 만들면
            시간이 꽤 걸립니다. 중간에 실패해도 그때까지 만든 DAY는 남습니다.
          </p>
        )}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !genUid || remaining <= 0}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 touch:py-2.5 hover:bg-brand-700 disabled:opacity-50"
        >
          {generating
            ? '생성 중...'
            : !genUid
              ? '학생을 선택하세요'
              : plannedDays <= 1
                ? `DAY ${nextDay} 시험지 생성`
                : `DAY ${nextDay}~${nextDay + plannedDays - 1} 시험지 ${plannedDays}개 생성`}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">단어 추가</h2>
        <p className="text-xs text-slate-500">
          교재 끝에 단어를 더 붙입니다. 이미 생성된 DAY 시험지는 영향 없음.
        </p>
        <textarea
          value={appendText}
          onChange={(e) => setAppendText(e.target.value)}
          rows={8}
          placeholder="새로 붙일 단어들"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className="text-xs text-slate-500">
          추가할 단어: {appendWords.length}개
          {appendIsTextbook && (
            <span className="ml-2 inline-block rounded bg-brand-100 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
              교재 형식 인식됨
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={handleAppend}
          disabled={appending || appendWords.length === 0}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          {appending ? '추가 중...' : `교재에 ${appendWords.length}단어 추가`}
        </button>
      </section>

      {series.words && series.words.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            전체 단어 ({series.words.length}개)
          </h2>
          <div className="max-h-[32rem] overflow-y-auto border border-slate-100 rounded">
            <ul className="divide-y divide-slate-100">
              {series.words.map((w, i) => {
                const inUse = i < used
                const editing = editingIdx === i
                return (
                  <li
                    key={i}
                    className={`px-3 py-2 text-sm ${
                      inUse ? 'text-slate-500' : 'text-slate-800'
                    }`}
                  >
                    {editing ? (
                      <div className="rounded-md border border-brand-200 bg-brand-50/30 p-3 space-y-2">
                        <p className="text-xs text-slate-500">
                          {String(i + 1).padStart(4, '0')}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-3">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              영단어
                            </label>
                            <input
                              type="text"
                              value={editEn}
                              onChange={(e) => setEditEn(e.target.value)}
                              autoFocus
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              발음 (IPA)
                            </label>
                            <input
                              type="text"
                              value={editIpa}
                              onChange={(e) => setEditIpa(e.target.value)}
                              placeholder="ǽdvent"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              품사
                            </label>
                            <input
                              type="text"
                              value={editPos}
                              onChange={(e) => setEditPos(e.target.value)}
                              placeholder="n."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              한국어 뜻
                            </label>
                            <input
                              type="text"
                              value={editKo}
                              onChange={(e) => setEditKo(e.target.value)}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              유의어 (쉼표로 구분)
                            </label>
                            <input
                              type="text"
                              value={editSynonymsRaw}
                              onChange={(e) => setEditSynonymsRaw(e.target.value)}
                              placeholder="arrival, appearance, emergence"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              영영 정의
                            </label>
                            <input
                              type="text"
                              value={editDefinitionEn}
                              onChange={(e) => setEditDefinitionEn(e.target.value)}
                              placeholder="The arrival of a notable person or thing"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              영어 예문
                            </label>
                            <input
                              type="text"
                              value={editExample}
                              onChange={(e) => setEditExample(e.target.value)}
                              placeholder="Since the advent of jet aircraft, travel has been sped-up."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              예문 한국어 번역
                            </label>
                            <input
                              type="text"
                              value={editExampleKo}
                              onChange={(e) => setEditExampleKo(e.target.value)}
                              placeholder="제트기의 출현 이후, 여행이 가속화되었다."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded border border-slate-300"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(i)}
                            className="text-xs text-white bg-brand-600 hover:bg-brand-700 rounded px-3 py-1.5"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs text-slate-400 w-12">
                          {String(i + 1).padStart(4, '0')}
                        </span>
                        <span className="font-medium">{w.en}</span>
                        <span className="text-slate-500">{w.ko}</span>
                        {inUse && (
                          <span className="text-[10px] text-slate-400">사용됨</span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(i)}
                            className="text-xs text-slate-500 hover:text-slate-900"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWord(i)}
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}
