import { useState, type FormEvent } from 'react'
import {
  CLASS_SESSION_STATUS_LABEL,
  type ClassSession,
  type ClassSessionStatus,
  type UserAccount,
} from '../lib/types'

const KST_TZ = 'Asia/Seoul'

const STATUSES: ClassSessionStatus[] = ['scheduled', 'done', 'canceled', 'makeup']

function todayISO(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

export interface SessionFormValues {
  title: string
  dateISO: string
  startTime: string
  endTime: string
  location: string
  cost: string
  status: ClassSessionStatus
  paid: boolean
  note: string
  /** 반복 생성 켜짐 여부. 신규 추가 시에만 사용. */
  repeat: boolean
  /** 반복 종료일(포함). repeat=true 일 때 사용. */
  endDateISO: string
  /** 반복할 요일 (0=일 … 6=토). */
  weekdays: number[]
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' 요일 (0=일 … 6=토). TZ 안전(UTC 파싱). */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 'YYYY-MM-DD'에 일수를 더한 로컬 날짜 문자열. */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * [startISO, endISO] 범위에서 weekdays 요일에 해당하는 모든 날짜를 반환.
 * weekdays 가 비어있으면 시작일만 반환. 최대 366일로 안전 상한.
 */
export function expandWeekdayDates(
  startISO: string,
  endISO: string,
  weekdays: number[],
): string[] {
  if (!weekdays.length || endISO < startISO) return [startISO]
  const set = new Set(weekdays)
  const out: string[] = []
  let cur = startISO
  for (let i = 0; i < 366 && cur <= endISO; i++) {
    if (set.has(weekdayOf(cur))) out.push(cur)
    cur = addDaysISO(cur, 1)
  }
  return out.length ? out : [startISO]
}

export const EMPTY_SESSION_FORM: SessionFormValues = {
  title: '1:1 개인 과외',
  dateISO: todayISO(),
  startTime: '19:00',
  endTime: '21:00',
  location: 'TBD',
  cost: '',
  status: 'scheduled',
  paid: false,
  note: '',
  repeat: false,
  endDateISO: '',
  weekdays: [weekdayOf(todayISO())],
}

export function fromSession(s: ClassSession): SessionFormValues {
  return {
    title: s.title,
    dateISO: s.dateISO,
    startTime: s.startTime,
    endTime: s.endTime,
    location: s.location,
    cost: String(s.cost || ''),
    status: s.status,
    paid: !!s.paid,
    note: s.note ?? '',
    repeat: false,
    endDateISO: '',
    weekdays: [weekdayOf(s.dateISO)],
  }
}

export interface SessionFormResult {
  title: string
  dateISO: string
  startTime: string
  endTime: string
  location: string
  cost: number
  status: ClassSessionStatus
  paid: boolean
  note?: string
  /** 생성할 날짜 목록. 단일이면 [dateISO], 반복이면 요일 확장 결과. 편집 시 무시. */
  dates: string[]
}

interface Props {
  value: SessionFormValues
  onChange: (next: SessionFormValues) => void
  /** 학생 선택 표시 여부 (신규 추가 시). */
  students?: UserAccount[]
  studentUid?: string
  onStudentChange?: (uid: string) => void
  /** 반복 생성 옵션 노출 (신규 추가 시에만). */
  allowRepeat?: boolean
  onSubmit: (result: SessionFormResult) => Promise<void>
  onCancel?: () => void
  submitLabel: string
  saving: boolean
  error?: string | null
}

export function SessionForm({
  value,
  onChange,
  students,
  studentUid,
  onStudentChange,
  allowRepeat,
  onSubmit,
  onCancel,
  submitLabel,
  saving,
  error,
}: Props) {
  const [localErr, setLocalErr] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalErr(null)
    if (!value.title.trim()) return
    if (!value.dateISO) return
    if (value.startTime >= value.endTime) {
      setLocalErr('종료 시간이 시작 시간보다 뒤여야 합니다.')
      return
    }
    if (students && !studentUid) {
      setLocalErr('학생을 선택하세요.')
      return
    }
    const cost = value.cost.trim() === '' ? 0 : parseInt(value.cost, 10)
    if (Number.isNaN(cost) || cost < 0) {
      setLocalErr('금액은 0 이상의 숫자여야 합니다.')
      return
    }
    let dates = [value.dateISO]
    if (allowRepeat && value.repeat) {
      if (!value.weekdays.length) {
        setLocalErr('반복할 요일을 하나 이상 선택하세요.')
        return
      }
      if (!value.endDateISO || value.endDateISO < value.dateISO) {
        setLocalErr('반복 종료일을 시작일 이후로 선택하세요.')
        return
      }
      dates = expandWeekdayDates(value.dateISO, value.endDateISO, value.weekdays)
    }
    await onSubmit({
      title: value.title.trim(),
      dateISO: value.dateISO,
      startTime: value.startTime,
      endTime: value.endTime,
      location: value.location.trim(),
      cost,
      status: value.status,
      paid: value.paid,
      note: value.note,
      dates,
    })
  }

  const inputCls =
    'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {students && onStudentChange && (
          <label className="col-span-2 sm:col-span-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">
              학생 <span className="text-red-500">*</span>
            </span>
            <select
              value={studentUid ?? ''}
              onChange={(e) => onStudentChange(e.target.value)}
              className={inputCls}
            >
              <option value="">— 학생 선택 —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                  {s.school ? ` (${s.school})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="col-span-2 sm:col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">수업명</span>
          <input
            type="text"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="col-span-2 sm:col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">
            {allowRepeat && value.repeat ? '시작일' : '날짜'}
          </span>
          <input
            type="date"
            value={value.dateISO}
            onChange={(e) => onChange({ ...value, dateISO: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">시작</span>
          <input
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">종료</span>
          <input
            type="time"
            value={value.endTime}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">장소</span>
          <input
            type="text"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">금액 (원)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value.cost}
            onChange={(e) => onChange({ ...value, cost: e.target.value })}
            placeholder="0"
            className={`${inputCls} tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">상태</span>
          <select
            value={value.status}
            onChange={(e) =>
              onChange({
                ...value,
                status: e.target.value as ClassSessionStatus,
              })
            }
            className={inputCls}
          >
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {CLASS_SESSION_STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </label>
        {allowRepeat && (
          <div className="col-span-2 sm:col-span-4 rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={value.repeat}
                onChange={(e) => onChange({ ...value, repeat: e.target.checked })}
                className="h-4 w-4 accent-brand-600"
              />
              반복 생성{' '}
              <span className="font-normal text-slate-400">
                (선택 요일로 기간 내 자동 추가)
              </span>
            </label>
            {value.repeat && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">요일</span>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((lbl, dow) => {
                      const on = value.weekdays.includes(dow)
                      return (
                        <button
                          key={dow}
                          type="button"
                          onClick={() =>
                            onChange({
                              ...value,
                              weekdays: on
                                ? value.weekdays.filter((d) => d !== dow)
                                : [...value.weekdays, dow].sort(),
                            })
                          }
                          className={`h-8 w-8 rounded-full text-xs font-medium transition ${
                            on
                              ? 'bg-brand-600 text-white'
                              : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
                          } ${dow === 0 ? 'text-red-400' : ''} ${
                            on && dow === 0 ? 'text-white' : ''
                          }`}
                        >
                          {lbl}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">
                    반복 종료일
                  </span>
                  <input
                    type="date"
                    value={value.endDateISO}
                    min={value.dateISO}
                    onChange={(e) =>
                      onChange({ ...value, endDateISO: e.target.value })
                    }
                    className={inputCls}
                  />
                </label>
                <p className="text-[11px] text-slate-400">
                  {value.repeat &&
                  value.weekdays.length &&
                  value.endDateISO &&
                  value.endDateISO >= value.dateISO
                    ? `${expandWeekdayDates(value.dateISO, value.endDateISO, value.weekdays).length}개 수업이 생성됩니다.`
                    : '시작일·요일·종료일을 지정하세요.'}
                </p>
              </>
            )}
          </div>
        )}
        <label className="col-span-2 sm:col-span-4 inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={value.paid}
            onChange={(e) => onChange({ ...value, paid: e.target.checked })}
            className="h-4 w-4 accent-emerald-600"
          />
          <span className={value.paid ? 'text-emerald-700 font-medium' : ''}>
            결제 완료
          </span>
          <span className="text-slate-400">(기본값 미결제)</span>
        </label>
        <label className="col-span-2 sm:col-span-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">
            메모 (선택)
          </span>
          <textarea
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            rows={2}
            className={inputCls}
          />
        </label>
      </div>
      {(localErr || error) && (
        <p className="text-xs text-red-600">{localErr || error}</p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs text-slate-500 hover:text-slate-900 px-2"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? '저장 중…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
