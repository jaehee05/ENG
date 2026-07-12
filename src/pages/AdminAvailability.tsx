import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllClassSessions } from '../lib/firestore'
import type { ClassSession } from '../lib/types'

const KST_TZ = 'Asia/Seoul'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
// 표시 시간대: 09:00 ~ 22:00 (마지막 블록 21:00~22:00)
const START_HOUR = 9
const END_HOUR = 22

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 'YYYY-MM-DD'에 일수를 더한 로컬 날짜 (TZ 안전). */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function hhmm(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function fmtMD(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}

export function AdminAvailability() {
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(1) // 기본: 다음 주
  // 선택된 가능 시간 키 집합: `${dateISO}T${hour}`
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    listAllClassSessions()
      .then((s) => {
        if (!cancelled) setSessions(s)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 이번 주 일요일 기준 + offset 주.
  const weekStart = useMemo(() => {
    const t = todayISO()
    const sunday = addDaysISO(t, -weekdayOf(t))
    return addDaysISO(sunday, weekOffset * 7)
  }, [weekOffset])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)),
    [weekStart],
  )
  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    [],
  )

  // 날짜 → 그 날의 (취소 제외) 수업들. 튜터가 이미 잡혀있는 시간.
  const busyByDate = useMemo(() => {
    const map = new Map<string, ClassSession[]>()
    for (const s of sessions) {
      if (s.status === 'canceled') continue
      const arr = map.get(s.dateISO) ?? []
      arr.push(s)
      map.set(s.dateISO, arr)
    }
    return map
  }, [sessions])

  /** 해당 날짜·시(hour 블록 h:00~h+1:00)에 기존 수업이 겹치는가. */
  function isBusy(dateISO: string, h: number): boolean {
    const arr = busyByDate.get(dateISO)
    if (!arr) return false
    const blockStart = hhmm(h)
    const blockEnd = hhmm(h + 1)
    return arr.some((s) => s.startTime < blockEnd && s.endTime > blockStart)
  }

  function keyOf(dateISO: string, h: number): string {
    return `${dateISO}T${h}`
  }

  function toggle(dateISO: string, h: number) {
    if (isBusy(dateISO, h)) return
    const k = keyOf(dateISO, h)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    setCopied(false)
  }

  const today = todayISO()

  // 주가 바뀌면 이전 주 선택은 유지하되(다른 주 키라 안 겹침), 표시엔 이번 주만 반영.
  // 공유 텍스트는 "현재 보고 있는 주"의 선택만 사용.
  const shareText = useMemo(() => {
    const lines: string[] = []
    for (const d of days) {
      const chosen = hours.filter((h) => selected.has(keyOf(d, h))).sort((a, b) => a - b)
      if (!chosen.length) continue
      // 연속 구간 병합
      const ranges: Array<[number, number]> = []
      let s = chosen[0]
      let e = chosen[0]
      for (let i = 1; i < chosen.length; i++) {
        if (chosen[i] === e + 1) e = chosen[i]
        else {
          ranges.push([s, e])
          s = chosen[i]
          e = chosen[i]
        }
      }
      ranges.push([s, e])
      const wd = WEEKDAYS[weekdayOf(d)]
      const rangeStr = ranges
        .map(([a, b]) => `${hhmm(a)}~${hhmm(b + 1)}`)
        .join(', ')
      lines.push(`· ${fmtMD(d)}(${wd}) ${rangeStr}`)
    }
    if (!lines.length) return ''
    return `안녕하세요! 아래 시간대에 수업이 가능합니다.\n\n${lines.join('\n')}\n\n편하신 시간 알려주시면 확정하겠습니다.`
  }, [days, hours, selected])

  const selectedCount = useMemo(
    () => days.reduce((n, d) => n + hours.filter((h) => selected.has(keyOf(d, h))).length, 0),
    [days, hours, selected],
  )

  async function copyText() {
    if (!shareText) return
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      // 클립보드 실패 시 무시 (문자/공유로 대체)
    }
  }

  async function shareNative() {
    if (!shareText) return
    const nav = navigator as Navigator & {
      share?: (data: { text: string }) => Promise<void>
    }
    if (nav.share) {
      try {
        await nav.share({ text: shareText })
      } catch {
        // 사용자 취소 등 무시
      }
    } else {
      void copyText()
    }
  }

  function clearWeek() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const d of days) for (const h of hours) next.delete(keyOf(d, h))
      return next
    })
    setCopied(false)
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/admin" className="text-xs text-slate-500 hover:text-slate-900">
          ← 관리자 도구
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-2 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          가능시간 공유
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          빈 시간대를 눌러 <b>수업 가능 시간</b>을 고르고, 학부모에게 복사·문자·공유로
          전달하세요. 이미 잡힌 수업은 회색으로 표시되고 선택할 수 없습니다.
        </p>
      </header>

      {/* 주 선택 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          [0, '이번 주'],
          [1, '다음 주'],
          [2, '2주 뒤'],
          [3, '3주 뒤'],
        ].map(([off, label]) => (
          <button
            key={off}
            type="button"
            onClick={() => setWeekOffset(off as number)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              weekOffset === off
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-1">
          {fmtMD(days[0])} ~ {fmtMD(days[6])}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-slate-100">
            <div className="border-r border-slate-100" />
            {days.map((d, i) => {
              const isToday = d === today
              return (
                <div
                  key={d}
                  className={`py-1.5 text-center border-r border-slate-100 last:border-r-0 ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-sky-500' : 'text-slate-600'
                  }`}
                >
                  <div className="text-[10px] font-medium">{WEEKDAYS[i]}</div>
                  <div
                    className={`text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white'
                        : 'text-slate-900'
                    }`}
                  >
                    {Number(d.split('-')[2])}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 시간 행 */}
          <div className="max-h-[62vh] overflow-y-auto">
            {hours.map((h) => (
              <div
                key={h}
                className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-slate-50 last:border-b-0"
              >
                <div className="flex items-start justify-end pr-1.5 pt-1 text-[10px] text-slate-400 tabular-nums border-r border-slate-100">
                  {hhmm(h)}
                </div>
                {days.map((d) => {
                  const busy = isBusy(d, h)
                  const on = selected.has(keyOf(d, h))
                  return (
                    <button
                      key={d + h}
                      type="button"
                      onClick={() => toggle(d, h)}
                      disabled={busy}
                      className={`h-9 border-r border-slate-100 last:border-r-0 transition ${
                        busy
                          ? 'bg-slate-100 cursor-not-allowed'
                          : on
                            ? 'bg-brand-500'
                            : 'bg-white hover:bg-brand-50'
                      }`}
                      aria-label={`${fmtMD(d)} ${hhmm(h)} ${busy ? '예약됨' : on ? '선택됨' : '가능'}`}
                    >
                      {busy && (
                        <span className="block h-1.5 w-1.5 mx-auto rounded-full bg-slate-300" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 선택 요약 + 공유 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            선택한 가능 시간
            <span className="ml-1.5 text-xs font-normal text-slate-400">
              {selectedCount}칸
            </span>
          </h2>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={clearWeek}
              className="text-xs text-slate-400 hover:text-red-500"
            >
              이번 주 선택 지우기
            </button>
          )}
        </div>
        {shareText ? (
          <>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-700 font-sans">
              {shareText}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyText}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700"
              >
                {copied ? '복사됨 ✓' : '복사'}
              </button>
              <a
                href={`sms:?body=${encodeURIComponent(shareText)}`}
                className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
              >
                문자로 보내기
              </a>
              <button
                type="button"
                onClick={shareNative}
                className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
              >
                공유
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">
            위 표에서 가능한 시간대를 선택하면 공유 문구가 만들어집니다.
          </p>
        )}
      </div>
    </div>
  )
}
