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
}

interface Props {
  value: SessionFormValues
  onChange: (next: SessionFormValues) => void
  /** 학생 선택 표시 여부 (신규 추가 시). */
  students?: UserAccount[]
  studentUid?: string
  onStudentChange?: (uid: string) => void
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
          <span className="text-xs font-medium text-slate-600">날짜</span>
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
            step={1000}
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
