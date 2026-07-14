import { useNavigate, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/useAuth'
import { accountSubjects } from '../lib/types'

interface MoreLink {
  to: string
  label: string
  desc?: string
  icon: ReactNode
}

const ico = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const icons = {
  user: (
    <svg {...ico}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  bell: (
    <svg {...ico}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  megaphone: (
    <svg {...ico}>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  reading: (
    <svg {...ico}>
      <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5Z" />
      <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5Z" />
    </svg>
  ),
  vocab: (
    <svg {...ico}>
      <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-2-5 2V6a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 11h4" />
    </svg>
  ),
  wordbook: (
    <svg {...ico}>
      <path d="M5 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
    </svg>
  ),
  history: (
    <svg {...ico}>
      <path d="M3 12a9 9 0 1 0 3.4-7.04" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  mock: (
    <svg {...ico}>
      <path d="M9 2h6l2 2h3v18H4V4h3l2-2Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  gear: (
    <svg {...ico}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
}

function MoreSection({ title, items }: { title: string; items: MoreLink[] }) {
  if (items.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
        {title}
      </h2>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
        {items.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              {m.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{m.label}</p>
              {m.desc && <p className="text-xs text-slate-400 truncate">{m.desc}</p>}
            </div>
            <span className="text-slate-300 text-lg shrink-0">›</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function More() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const subj = profile ? accountSubjects(profile) : { korean: true, english: true }
  const showEnglish = subj.english || isAdmin
  const showMock = isAdmin || subj.korean

  async function handleLogout() {
    await logOut()
    navigate('/login')
  }

  const learning: MoreLink[] = []
  if (showEnglish) {
    learning.push(
      { to: '/reading', label: '지문 문제풀이', icon: icons.reading },
      { to: '/vocab', label: '단어 시험지', icon: icons.vocab },
      { to: '/wordbook', label: '내 단어장', icon: icons.wordbook },
    )
  }
  if (showMock) {
    learning.push({ to: '/korean-mocks', label: '모의고사', icon: icons.mock })
  }
  learning.push({ to: '/history', label: '내 기록', desc: '지난 시험 점수', icon: icons.history })

  const news: MoreLink[] = [
    { to: '/notifications', label: '알림', icon: icons.bell },
    { to: '/notice', label: '공지사항 및 이벤트', icon: icons.megaphone },
  ]

  const admin: MoreLink[] = isAdmin
    ? [{ to: '/admin', label: '관리자 도구', desc: '학생·정산·수업 관리', icon: icons.gear }]
    : []

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          더보기
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          내 정보
        </h1>
      </header>

      {/* 내 정보 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-lg font-semibold">
          {profile?.displayName?.slice(0, 1) ?? '?'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-base font-semibold text-slate-900 truncate">
              {profile?.displayName}
            </p>
            {isAdmin && (
              <span className="inline-block rounded bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium">
                관리자
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">
            {[profile?.school, profile?.phone].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      <MoreSection title="관리" items={admin} />
      <MoreSection title="학습" items={learning} />
      <MoreSection title="소식" items={news} />

      <button
        type="button"
        onClick={handleLogout}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        로그아웃
      </button>
    </div>
  )
}
