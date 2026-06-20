import { useEffect, useState, type FormEvent } from 'react'
import { getTodayClass, saveTodayClass } from '../lib/firestore'
import { liveActivity } from '../lib/liveActivity'
import type { ClassSchedule } from '../lib/types'

const CAROUSEL_COLOR = '#7AB371'

/** Timestamp/Date 를 datetime-local input 값으로 변환 (KST 가정). */
function toLocalInput(d: Date | null): string {
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function AdminClass() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [location, setLocation] = useState('')
  const [startLabel, setStartLabel] = useState('수업 시작')
  const [endLabel, setEndLabel] = useState('수업 끝')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  const [activityId, setActivityId] = useState<string>('')
  const [activitySupported, setActivitySupported] = useState<boolean | null>(null)
  const [activityDiagnose, setActivityDiagnose] = useState<{
    reason: string
    error?: string
  } | null>(null)
  const [activityBusy, setActivityBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getTodayClass(), liveActivity.diagnose(), liveActivity.currentId()])
      .then(([sched, diag, id]) => {
        if (cancelled) return
        if (sched) populate(sched)
        setActivitySupported(diag.supported)
        setActivityDiagnose({ reason: diag.reason, error: diag.error })
        setActivityId(id)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : '불러오기 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function populate(sched: ClassSchedule) {
    setLocation(sched.location ?? '')
    setStartLabel(sched.startLabel || '수업 시작')
    setEndLabel(sched.endLabel || '수업 끝')
    setStartAt(toLocalInput(sched.startAt?.toDate() ?? null))
    setEndAt(toLocalInput(sched.endAt?.toDate() ?? null))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const s = fromLocalInput(startAt)
    const en = fromLocalInput(endAt)
    if (!s || !en) {
      setError('시작/종료 시각을 모두 입력하세요.')
      return
    }
    if (s >= en) {
      setError('종료 시각은 시작 시각보다 뒤여야 합니다.')
      return
    }
    setSaving(true)
    try {
      await saveTodayClass({
        location: location.trim(),
        startLabel: startLabel.trim(),
        endLabel: endLabel.trim(),
        startAt: s,
        endAt: en,
      })
      setNotice('저장됨')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function handleStartActivity() {
    setError(null)
    setNotice(null)
    const s = fromLocalInput(startAt)
    const en = fromLocalInput(endAt)
    if (!s || !en) {
      setError('시작/종료 시각을 먼저 저장하세요.')
      return
    }
    setActivityBusy(true)
    try {
      const id = await liveActivity.start({
        location: location.trim(),
        startLabel: startLabel.trim(),
        endLabel: endLabel.trim(),
        startAtMs: s.getTime(),
        endAtMs: en.getTime(),
      })
      if (id) {
        setActivityId(id)
        setNotice('Dynamic Island Live Activity 시작됨')
      } else {
        setError('이 기기에서는 Live Activity 를 시작할 수 없습니다. (iOS 16.1+ 필요, iPhone에서만 동작)')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activity 시작 실패')
    } finally {
      setActivityBusy(false)
    }
  }

  async function handleUpdateActivity() {
    setError(null)
    setNotice(null)
    if (!activityId) {
      setError('진행 중인 Activity 가 없어요. 먼저 시작하세요.')
      return
    }
    const s = fromLocalInput(startAt)
    const en = fromLocalInput(endAt)
    if (!s || !en) {
      setError('시작/종료 시각을 모두 입력하세요.')
      return
    }
    setActivityBusy(true)
    try {
      await liveActivity.update({
        id: activityId,
        location: location.trim(),
        startLabel: startLabel.trim(),
        endLabel: endLabel.trim(),
        startAtMs: s.getTime(),
        endAtMs: en.getTime(),
      })
      setNotice('Activity 갱신됨')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activity 갱신 실패')
    } finally {
      setActivityBusy(false)
    }
  }

  async function handleEndActivity() {
    setError(null)
    setNotice(null)
    setActivityBusy(true)
    try {
      await liveActivity.end(activityId || undefined)
      setActivityId('')
      setNotice('Activity 종료됨')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activity 종료 실패')
    } finally {
      setActivityBusy(false)
    }
  }

  const previewStart = fromLocalInput(startAt)
  const previewEnd = fromLocalInput(endAt)

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리자
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          오늘 수업 (Dynamic Island)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          입력 후 폰에서 'Live Activity 시작'을 누르면 잠금화면 + Dynamic Island 에 표시돼요.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">불러오는 중…</p>}

      {!loading && (
        <>
          <form
            onSubmit={handleSave}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
          >
            <Field label="수업 장소" hint="좌상단 작은 텍스트">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 강남 본원 A호 / 줌 수업"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작 라벨" hint="시간 옆에 붙는 짧은 텍스트">
                <input
                  type="text"
                  value={startLabel}
                  onChange={(e) => setStartLabel(e.target.value)}
                  placeholder="예: 시작"
                  className={inputCls}
                  maxLength={6}
                />
              </Field>
              <Field label="종료 라벨" hint="시간 옆에 붙는 짧은 텍스트">
                <input
                  type="text"
                  value={endLabel}
                  onChange={(e) => setEndLabel(e.target.value)}
                  placeholder="예: 끝"
                  className={inputCls}
                  maxLength={6}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="수업 시작 시각">
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="수업 종료 시각">
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </form>

          {previewStart && previewEnd && (
            <Preview
              location={location}
              startLabel={startLabel}
              endLabel={endLabel}
              start={previewStart}
              end={previewEnd}
            />
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Live Activity</h2>
              {activitySupported === false && (
                <span
                  className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5"
                  title={activityDiagnose?.error ?? ''}
                >
                  미지원 ({activityDiagnose?.reason ?? '?'})
                </span>
              )}
              {activitySupported === true && activityId && (
                <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                  진행 중
                </span>
              )}
            </header>
            <p className="text-xs text-slate-500">
              iPhone (iOS 16.1+) 의 KJHEDU 앱에서만 동작합니다. 브라우저에서는 버튼이 동작하지 않아요.
            </p>
            {activityDiagnose && (
              <pre className="text-[10px] text-slate-500 bg-slate-50 rounded p-2 overflow-x-auto">
                diagnose: {JSON.stringify(activityDiagnose, null, 2)}
              </pre>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleStartActivity}
                disabled={activityBusy || activitySupported === false}
                className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
              >
                {activityBusy ? '처리 중…' : '시작'}
              </button>
              <button
                type="button"
                onClick={handleUpdateActivity}
                disabled={activityBusy || !activityId}
                className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                현재 입력으로 갱신
              </button>
              <button
                type="button"
                onClick={handleEndActivity}
                disabled={activityBusy}
                className="rounded-md text-red-600 text-sm font-medium px-4 py-2 hover:bg-red-50 disabled:opacity-50"
              >
                종료
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">
        {label}
        {hint && <span className="ml-1.5 text-[10px] text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Preview({
  location,
  startLabel,
  endLabel,
  start,
  end,
}: {
  location: string
  startLabel: string
  endLabel: string
  start: Date
  end: Date
}) {
  const now = Date.now()
  const before = now < start.getTime()
  const during = !before && now < end.getTime()
  const target = during ? end.getTime() : start.getTime()
  const diff = Math.max(0, target - now)
  const hh = Math.floor(diff / 3600000)
  const mm = Math.floor((diff % 3600000) / 60000)
  const remainText = hh > 0 ? `${hh}시간 ${mm}분` : `${mm}분`
  const stateText = before ? '수업 전' : during ? '수업 중' : '수업 완료'
  const untilText = before ? '수업 시작까지' : during ? '수업 종료까지' : '오늘 수업 종료됨'
  const total = end.getTime() - start.getTime()
  const elapsed = Math.max(0, Math.min(total, now - start.getTime()))
  const pct = total > 0 ? (elapsed / total) * 100 : 0

  return (
    <section className="rounded-xl bg-slate-950 p-4 text-white">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
        Dynamic Island 미리보기 (잠금화면)
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: CAROUSEL_COLOR }} />
          {location || '수업 장소'}
        </span>
        <span className="text-slate-400">🪑 KJHEDU</span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-xs text-slate-400">{startLabel}</p>
          <p className="text-base font-semibold" style={{ color: CAROUSEL_COLOR }}>
            {fmtClock(start)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold">
            <span style={{ color: CAROUSEL_COLOR }}>{fmtClock(end)}</span>{' '}
            <span className="text-slate-300">{endLabel}</span>
          </p>
        </div>
      </div>
      <div className="mt-2 relative h-2 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: CAROUSEL_COLOR }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 text-[10px]"
          style={{ left: `calc(${pct}% - 8px)` }}
        >
          ✏️
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px]" style={{ color: CAROUSEL_COLOR }}>
          {stateText}
        </p>
        <p className="text-[11px] text-slate-300 text-right">
          <span className="font-medium">{remainText}</span>
          <span className="ml-1 text-slate-400 uppercase tracking-wider text-[9px]">
            {untilText}
          </span>
        </p>
      </div>
    </section>
  )
}
