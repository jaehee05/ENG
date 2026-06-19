import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteAllNotificationsForUser,
  deleteNotification,
  formatDate,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/firestore'
import type { UserNotification } from '../lib/types'

function fmtDateTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const KIND_LABEL: Record<string, string> = {
  push: '푸시',
  announcement: '공지',
  assignment: '과제',
  system: '시스템',
}

export function Notifications() {
  const { profile } = useAuth()
  const [items, setItems] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!profile) return
    setLoading(true)
    try {
      setItems(await listNotificationsForUser(profile.id))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function handleMarkAllRead() {
    if (!profile) return
    setBusy(true)
    try {
      await markAllNotificationsRead(profile.id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAll() {
    if (!profile) return
    if (!window.confirm('알림함의 모든 알림을 삭제할까요? 되돌릴 수 없어요.'))
      return
    setBusy(true)
    try {
      await deleteAllNotificationsForUser(profile.id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteOne(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id))
    try {
      await deleteNotification(id)
    } catch {
      await load()
    }
  }

  async function handleItemClick(n: UserNotification) {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id)
      } catch {
        // 무시
      }
    }
  }

  const unread = items.filter((n) => !n.readAt).length

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            나의 활동
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            알림함
          </h1>
          {!loading && (
            <p className="text-xs text-slate-500 mt-1">
              {unread > 0 ? `안 읽은 알림 ${unread}건` : '모두 확인했어요'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={busy}
              className="rounded-md border border-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              모두 읽음 처리
            </button>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={busy}
              className="rounded-md border border-red-200 text-red-600 text-xs font-medium px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
            >
              모두 삭제
            </button>
          )}
        </div>
      </header>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          알림이 없어요.
        </div>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
        {items.map((n) => {
          const body = (
            <div className="flex items-start gap-3 px-4 py-3">
              {!n.readAt && (
                <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
              )}
              <div className={`flex-1 min-w-0 ${n.readAt ? 'pl-[18px]' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block rounded bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5">
                    {KIND_LABEL[n.kind ?? 'system'] ?? '알림'}
                  </span>
                  <span
                    className={`text-sm truncate ${n.readAt ? 'text-slate-600 font-normal' : 'text-slate-900 font-semibold'}`}
                  >
                    {n.title}
                  </span>
                </div>
                {n.body && (
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                    {n.body}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  {fmtDateTime(n.createdAt) || formatDate(n.createdAt)}
                </p>
              </div>
            </div>
          )
          return (
            <li key={n.id} className="relative group">
              {n.link ? (
                <Link
                  to={n.link}
                  onClick={() => handleItemClick(n)}
                  className="block hover:bg-slate-50 pr-10"
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className="w-full text-left hover:bg-slate-50 pr-10"
                >
                  {body}
                </button>
              )}
              <button
                type="button"
                aria-label="알림 삭제"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void handleDeleteOne(n.id)
                }}
                className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
