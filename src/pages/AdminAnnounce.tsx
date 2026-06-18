import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/useAuth'
import { listAccounts } from '../lib/account'
import {
  createAnnouncement,
  createUserNotification,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from '../lib/firestore'
import { purgeAllNotifications } from '../lib/ppurioApi'
import type { Announcement } from '../lib/types'

function fmtDateTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function AdminAnnounce() {
  const { profile } = useAuth()
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [notifyAllStudents, setNotifyAllStudents] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)

  const [purging, setPurging] = useState(false)
  async function handlePurge() {
    if (
      !window.confirm(
        '모든 학생 알림함의 알림을 전부 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
      )
    )
      return
    setPurging(true)
    setNotice(null)
    try {
      const r = await purgeAllNotifications()
      setNotice(`${r.deleted}건 정리 완료.`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '정리 실패')
    } finally {
      setPurging(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      setItems(await listAnnouncements())
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!title.trim()) {
      setError('제목을 입력하세요.')
      return
    }
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      if (editingId) {
        await updateAnnouncement(editingId, {
          title,
          body,
          pinned,
        })
        setNotice('공지를 수정했어요.')
      } else {
        const annId = await createAnnouncement({
          title,
          body,
          pinned,
          createdBy: profile.id,
          createdByName: profile.displayName,
        })
        if (notifyAllStudents) {
          // 모든 활성 학생 알림함에 추가
          const accounts = await listAccounts()
          const targets = accounts.filter(
            (a) => a.role === 'student' && a.status === 'active',
          )
          for (const s of targets) {
            await createUserNotification({
              recipientUid: s.id,
              title: `📢 ${title.trim()}`,
              body: body.trim(),
              kind: 'announcement',
              link: '/notice',
              announcementId: annId,
            })
          }
          setNotice(`공지 등록 + 학생 ${targets.length}명 알림함에 전송.`)
        } else {
          setNotice('공지를 등록했어요. (알림함 전송 안 함)')
        }
      }
      setTitle('')
      setBody('')
      setPinned(false)
      setEditingId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(a: Announcement) {
    setEditingId(a.id)
    setTitle(a.title)
    setBody(a.body)
    setPinned(!!a.pinned)
  }

  function cancelEdit() {
    setEditingId(null)
    setTitle('')
    setBody('')
    setPinned(false)
  }

  async function handleDelete(a: Announcement) {
    if (!window.confirm(`"${a.title}" 공지를 삭제할까요?`)) return
    await deleteAnnouncement(a.id)
    await load()
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            관리자
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            공지사항
          </h1>
        </div>
        <button
          type="button"
          onClick={handlePurge}
          disabled={purging}
          className="rounded-md border border-red-200 text-red-600 text-xs font-medium px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
        >
          {purging ? '정리 중…' : '학생 알림함 전체 정리'}
        </button>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {editingId ? '공지 수정' : '새 공지 작성'}
          </p>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs text-slate-500 hover:text-slate-900 underline"
            >
              취소
            </button>
          )}
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="공지 내용. 학생 홈/공지 페이지에 표시됩니다."
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="accent-brand-600"
            />
            상단 고정
          </label>
          {!editingId && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyAllStudents}
                onChange={(e) => setNotifyAllStudents(e.target.checked)}
                className="accent-brand-600"
              />
              모든 학생 알림함에 추가
            </label>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {notice && <p className="text-xs text-brand-700">{notice}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? '저장 중…' : editingId ? '수정 저장' : '공지 등록'}
          </button>
        </div>
      </form>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 공지가 없어요.</p>
      )}

      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {a.pinned && (
                  <span className="inline-block rounded bg-amber-50 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 border border-amber-200">
                    📌 고정
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {a.title}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  className="text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a)}
                  className="text-slate-400 hover:text-red-600"
                >
                  삭제
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {a.createdByName} · {fmtDateTime(a.createdAt)}
            </p>
            <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap leading-relaxed">
              {a.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
