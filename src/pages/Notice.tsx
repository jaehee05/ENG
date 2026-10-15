import { useEffect, useState } from 'react'
import { listAnnouncements } from '../lib/firestore'
import type { Announcement } from '../lib/types'
import { Badge, Card, EmptyState, PageHeader, SkeletonList } from '../components/ui'

function fmtDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function Notice() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listAnnouncements()
      .then((list) => {
        if (cancelled) return
        // pinned가 위로
        const sorted = [...list].sort((a, b) => {
          if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
          return (
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
          )
        })
        setItems(sorted)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader title="공지사항" />

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <Card padded={false}>
          <EmptyState title="등록된 공지가 없어요" />
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-card bg-white p-5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {a.pinned && <Badge tone="amber">고정</Badge>}
                <p className="text-[17px] font-bold text-slate-900">{a.title}</p>
              </div>
              <p className="text-[13px] text-slate-500 mt-1 tabular-nums">
                {a.createdByName} · {fmtDate(a.createdAt)}
              </p>
              <p className="text-[15px] text-slate-700 mt-3 whitespace-pre-wrap leading-relaxed">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
