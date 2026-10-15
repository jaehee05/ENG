import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteAllNotificationsForUser,
  deleteNotification,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/firestore'
import type { UserNotification } from '../lib/types'
import { Button, Card, EmptyState, PageHeader, SkeletonList, confirm, cx } from '../components/ui'

function fmtDateTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const megaphone = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
)
const docIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
)
const bell = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
)

interface KindCfg {
  label: string
  labelCls: string
  iconBg: string
  icon: ReactNode
}
const KIND: Record<string, KindCfg> = {
  announcement: {
    label: '공지사항',
    labelCls: 'text-red-500',
    iconBg: 'bg-red-50 text-red-500',
    icon: megaphone,
  },
  assignment: {
    label: '과제',
    labelCls: 'text-violet-600',
    iconBg: 'bg-violet-50 text-violet-600',
    icon: docIcon,
  },
  push: {
    label: '알림',
    labelCls: 'text-slate-500',
    iconBg: 'bg-slate-100 text-slate-500',
    icon: bell,
  },
  system: {
    label: '시스템',
    labelCls: 'text-slate-500',
    iconBg: 'bg-slate-100 text-slate-500',
    icon: bell,
  },
}
const kindOf = (k?: string): KindCfg => KIND[k ?? 'system'] ?? KIND.system

export function Notifications() {
  const { profile } = useAuth()
  const [items, setItems] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

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

  async function handleDeleteAll() {
    if (!profile) return
    if (!(await confirm('알림함의 모든 알림을 삭제할까요?\n되돌릴 수 없어요.', { danger: true, confirmText: '모두 삭제' })))
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
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: x.readAt ?? null } : x)),
      )
      try {
        await markNotificationRead(n.id)
      } catch {
        // 무시
      }
    }
  }

  const unread = items.filter((n) => !n.readAt).length

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* 뒤로가기는 헤더가 그린다 — 화면마다 자리와 모양이 달라지지 않게. */}
      <PageHeader
        title="알림"
        action={
          items.length > 0 && (
            <Button size="sm" variant="secondary" className="bg-white" onClick={() => setEditing((v) => !v)}>
              {editing ? '완료' : '편집'}
            </Button>
          )
        }
      />

      {editing && items.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[13px] text-slate-500">{unread > 0 ? `안 읽음 ${unread}` : '모두 확인했어요'}</span>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button
                size="sm"
                variant="text"
                onClick={() => profile && markAllNotificationsRead(profile.id).then(load)}
                disabled={busy}
              >
                모두 읽음
              </Button>
            )}
            <Button size="sm" variant="text" className="text-red-500" onClick={handleDeleteAll} disabled={busy}>
              모두 삭제
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <Card padded={false}>
          <EmptyState title="알림이 없어요" />
        </Card>
      ) : (
        <Card padded={false}>
          <ul>
            {items.map((n) => {
              const cfg = kindOf(n.kind)
              const inner = (
                <div className="flex items-start gap-3 px-5 py-4">
                  <span className={cx('shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full', cfg.iconBg)}>
                    {cfg.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px]">
                      <span className={cx('font-bold', cfg.labelCls)}>{cfg.label}</span>
                      <span className="text-slate-400"> · {fmtDateTime(n.createdAt)}</span>
                    </p>
                    <p className={cx('mt-0.5 text-[15px] truncate', n.readAt ? 'text-slate-500' : 'text-slate-900 font-semibold')}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-[14px] text-slate-500 line-clamp-2 whitespace-pre-wrap">{n.body}</p>
                    )}
                  </div>
                  {!n.readAt && !editing && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="안 읽음" />}
                  {editing && (
                    <button
                      type="button"
                      aria-label="삭제"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        void handleDeleteOne(n.id)
                      }}
                      className="pressable shrink-0 self-center h-9 rounded-xl bg-red-50 text-red-500 text-[13px] font-semibold px-3"
                    >
                      삭제
                    </button>
                  )}
                </div>
              )
              const rowCls = 'pressable block w-full text-left rounded-card hover:bg-slate-50 active:bg-slate-100'
              return (
                <li key={n.id}>
                  {n.link && !editing ? (
                    <Link to={n.link} onClick={() => handleItemClick(n)} className={rowCls}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => !editing && handleItemClick(n)} className={rowCls}>
                      {inner}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
