import { useEffect, useState } from 'react'
import { listAnnouncements } from '../lib/firestore'
import type { Announcement } from '../lib/types'

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
    <div className="space-y-5 max-w-2xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          KJHEDU
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          공지사항
        </h1>
      </header>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          등록된 공지가 없어요.
        </div>
      )}

      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {a.pinned && (
                <span className="inline-block rounded bg-amber-50 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 border border-amber-200">
                  📌
                </span>
              )}
              <p className="text-[15px] font-semibold text-slate-900">
                {a.title}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {a.createdByName} · {fmtDate(a.createdAt)}
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
