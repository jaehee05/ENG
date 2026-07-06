import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createClassSession,
  createScheduleToken,
  deleteClassSession,
  deleteScheduleToken,
  findScheduleTokenByStudent,
  listClassSessionsForStudent,
  updateClassSession,
  updateScheduleToken,
} from '../lib/firestore'
import {
  CLASS_SESSION_STATUS_LABEL,
  type ClassSession,
  type ClassSessionStatus,
  type ScheduleToken,
} from '../lib/types'

const KST_TZ = 'Asia/Seoul'

const STATUSES: ClassSessionStatus[] = ['scheduled', 'done', 'canceled', 'makeup']

const STATUS_BADGE: Record<ClassSessionStatus, string> = {
  scheduled: 'bg-sky-50 text-sky-700 border-sky-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  canceled: 'bg-red-50 text-red-700 border-red-200',
  makeup: 'bg-orange-50 text-orange-700 border-orange-200',
}

function todayISO(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

/** crypto.getRandomValues 로 32자 base64url 토큰 생성. */
function genToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface FormState {
  title: string
  dateISO: string
  startTime: string
  endTime: string
  location: string
  cost: string
  status: ClassSessionStatus
  note: string
}

const EMPTY_FORM: FormState = {
  title: '수업',
  dateISO: todayISO(),
  startTime: '19:00',
  endTime: '21:00',
  location: '',
  cost: '',
  status: 'scheduled',
  note: '',
}

export function ScheduleManager({
  studentUid,
  studentName,
}: {
  studentUid: string
  studentName: string
}) {
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [token, setToken] = useState<ScheduleToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      listClassSessionsForStudent(studentUid),
      findScheduleTokenByStudent(studentUid),
    ])
      .then(([s, t]) => {
        if (cancelled) return
        setSessions(s)
        setToken(t)
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
  }, [studentUid])

  async function reload() {
    const s = await listClassSessionsForStudent(studentUid)
    setSessions(s)
  }

  function startEdit(s: ClassSession) {
    setForm({
      title: s.title,
      dateISO: s.dateISO,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      cost: String(s.cost || ''),
      status: s.status,
      note: s.note ?? '',
    })
    setEditingId(s.id)
    setShowAdd(true)
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowAdd(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    if (!form.dateISO) return
    if (form.startTime >= form.endTime) {
      setError('종료 시간이 시작 시간보다 뒤여야 합니다.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const cost = form.cost.trim() === '' ? 0 : parseInt(form.cost, 10)
      if (Number.isNaN(cost) || cost < 0) {
        setError('비용은 0 이상의 숫자여야 합니다.')
        setSaving(false)
        return
      }
      const payload = {
        title: form.title.trim(),
        dateISO: form.dateISO,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location.trim(),
        cost,
        status: form.status,
        note: form.note,
      }
      if (editingId) {
        await updateClassSession(editingId, payload)
      } else {
        await createClassSession({ studentUid, ...payload })
      }
      resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: ClassSession) {
    if (!window.confirm(`"${s.title}" (${s.dateISO}) 수업을 삭제하시겠습니까?`)) return
    try {
      await deleteClassSession(s.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  async function issueToken() {
    if (token) return
    const t = genToken()
    try {
      await createScheduleToken({
        token: t,
        studentUid,
        studentName,
        hideCost: false,
      })
      setToken({
        id: t,
        studentUid,
        studentName,
        hideCost: false,
        createdAt: null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '토큰 생성 실패')
    }
  }

  async function toggleHideCost() {
    if (!token) return
    const next = !token.hideCost
    try {
      await updateScheduleToken(token.id, { hideCost: next })
      setToken({ ...token, hideCost: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장 실패')
    }
  }

  async function revokeToken() {
    if (!token) return
    if (
      !window.confirm(
        '공유 링크를 폐기하시겠습니까? 기존 링크는 즉시 만료되고, 새 링크를 발급할 수 있습니다.',
      )
    )
      return
    try {
      await deleteScheduleToken(token.id)
      setToken(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '토큰 폐기 실패')
    }
  }

  const shareUrl = token
    ? `${window.location.origin}/schedule/${token.id}`
    : null

  async function copyShareUrl() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // clipboard 실패 시 무시 (사용자가 수동 복사 가능)
    }
  }

  const upcomingSessions = useMemo(() => {
    const today = todayISO()
    return sessions
      .filter((s) => s.dateISO >= today)
      .sort((a, b) => {
        if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO)
        return a.startTime.localeCompare(b.startTime)
      })
      .slice(0, 20)
  }, [sessions])

  const pastSessions = useMemo(() => {
    const today = todayISO()
    return sessions
      .filter((s) => s.dateISO < today)
      .sort((a, b) => {
        if (a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO)
        return b.startTime.localeCompare(a.startTime)
      })
      .slice(0, 20)
  }, [sessions])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">수업 일정</h2>
        <span className="text-xs text-slate-500">총 {sessions.length}건</span>
      </div>

      {/* 공유 링크 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800">학생 공유 링크</p>
          {token ? (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={token.hideCost}
                  onChange={toggleHideCost}
                  className="h-3.5 w-3.5"
                />
                비용 숨김
              </label>
              <button
                type="button"
                onClick={revokeToken}
                className="text-xs text-slate-400 hover:text-red-600 px-1"
              >
                폐기
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={issueToken}
              className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800"
            >
              공유 링크 생성
            </button>
          )}
        </div>
        {shareUrl && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono text-slate-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={copyShareUrl}
              className="shrink-0 rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-2.5 py-1.5 hover:bg-slate-50"
            >
              복사
            </button>
          </div>
        )}
        {!token && (
          <p className="text-xs text-slate-500">
            학생/학부모가 볼 수 있는 캘린더 링크입니다. 링크에 포함된 토큰만
            해당 학생의 일정을 조회할 수 있습니다.
          </p>
        )}
      </div>

      {/* 등록/편집 폼 */}
      {showAdd ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="col-span-2 sm:col-span-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">수업명</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="col-span-2 sm:col-span-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">날짜</span>
              <input
                type="date"
                value={form.dateISO}
                onChange={(e) => setForm({ ...form, dateISO: e.target.value })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">시작</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">종료</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">장소</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="예: 학생 자택 / 스타벅스 강남점"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">
                비용 (원)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                placeholder="0"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">상태</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as ClassSessionStatus,
                  })
                }
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {CLASS_SESSION_STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 sm:col-span-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">
                메모 (선택)
              </span>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="text-xs text-slate-500 hover:text-slate-900 px-2"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? '저장 중…' : editingId ? '수정 저장' : '등록'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg border border-dashed border-slate-300 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-400 text-sm py-3"
        >
          + 새 수업 추가
        </button>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">불러오는 중…</p>
      ) : (
        <>
          <SessionGroup
            label="예정된 수업"
            list={upcomingSessions}
            onEdit={startEdit}
            onDelete={handleDelete}
            emptyText="예정된 수업이 없습니다."
          />
          {pastSessions.length > 0 && (
            <SessionGroup
              label="지난 수업"
              list={pastSessions}
              onEdit={startEdit}
              onDelete={handleDelete}
              emptyText=""
              muted
            />
          )}
        </>
      )}
    </section>
  )
}

function SessionGroup({
  label,
  list,
  onEdit,
  onDelete,
  emptyText,
  muted = false,
}: {
  label: string
  list: ClassSession[]
  onEdit: (s: ClassSession) => void
  onDelete: (s: ClassSession) => void
  emptyText: string
  muted?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <p
        className={`text-xs font-medium ${muted ? 'text-slate-400' : 'text-slate-600'}`}
      >
        {label} ({list.length})
      </p>
      {list.length === 0 ? (
        emptyText && (
          <p className="text-xs text-slate-400 px-1">{emptyText}</p>
        )
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {list.map((s) => (
            <li
              key={s.id}
              className="px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50"
            >
              <span
                className={`shrink-0 inline-block rounded-full text-[10px] font-medium px-1.5 py-0.5 border ${STATUS_BADGE[s.status]}`}
              >
                {CLASS_SESSION_STATUS_LABEL[s.status]}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm truncate ${muted ? 'text-slate-600' : 'text-slate-900'}`}
                >
                  {s.title}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {s.dateISO} · {s.startTime}–{s.endTime}
                  {s.location && ` · ${s.location}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(s)}
                className="text-xs text-slate-500 hover:text-slate-900 px-1"
              >
                편집
              </button>
              <button
                type="button"
                onClick={() => onDelete(s)}
                className="text-xs text-slate-400 hover:text-red-600 px-1"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
