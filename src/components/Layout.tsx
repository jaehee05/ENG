import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { useAuth } from '../contexts/useAuth'
import { unreadNotificationCount } from '../lib/firestore'

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: ReactNode
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const homeIcon = (
  <svg {...iconProps}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
)
const readingIcon = (
  <svg {...iconProps}>
    <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5Z" />
    <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5Z" />
  </svg>
)
const vocabIcon = (
  <svg {...iconProps}>
    <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-2-5 2V6a2 2 0 0 1 2-2Z" />
    <path d="M9 8h6M9 11h4" />
  </svg>
)
const wordbookIcon = (
  <svg {...iconProps}>
    <path d="M5 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
  </svg>
)
const historyIcon = (
  <svg {...iconProps}>
    <path d="M3 12a9 9 0 1 0 3.4-7.04" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </svg>
)
const checkIcon = (
  <svg {...iconProps}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)
const studentsIcon = (
  <svg {...iconProps}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20c0-3 3.5-5 7-5s7 2 7 5" />
    <circle cx="17" cy="9" r="3" />
    <path d="M22 19c0-2.5-2.5-4-5-4" />
  </svg>
)
const notifyIcon = (
  <svg {...iconProps}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
)
const calendarIcon = (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

const adminGearIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const studentNav: NavItem[] = [
  { to: '/', label: '홈', end: true, icon: homeIcon },
  { to: '/assignments', label: '과제', icon: checkIcon },
  { to: '/reading', label: '지문', icon: readingIcon },
  { to: '/vocab', label: '단어', icon: vocabIcon },
  { to: '/schedule', label: '일정', icon: calendarIcon },
]

const adminMobileNav: NavItem[] = [
  { to: '/', label: '홈', end: true, icon: homeIcon },
  { to: '/assignments', label: '과제', icon: checkIcon },
  { to: '/vocab', label: '단어', icon: vocabIcon },
  { to: '/schedule', label: '일정', icon: calendarIcon },
  { to: '/admin', label: '관리', icon: adminGearIcon },
]

const studentExtraNav: NavItem[] = [
  { to: '/wordbook', label: '단어장', icon: wordbookIcon },
  { to: '/history', label: '기록', icon: historyIcon },
]

const adminExtraNav: NavItem[] = [
  { to: '/admin', label: '관리', icon: adminGearIcon },
  { to: '/admin/students', label: '학생', icon: studentsIcon },
  { to: '/admin/notify', label: '알림', icon: notifyIcon },
]

export function Layout() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    unreadNotificationCount(profile.id)
      .then((n) => {
        if (!cancelled) setUnread(n)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // location.pathname 변경 시 다시 카운트 (알림함 페이지 떠난 직후 등 반영)
  }, [profile, location.pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let removed = false
    let handle: { remove: () => void } | null = null
    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const link = (event?.notification?.data as { link?: unknown } | undefined)
        ?.link
      if (typeof link === 'string' && link.startsWith('/')) {
        navigate(link)
      } else {
        navigate('/notifications')
      }
    })
      .then((h) => {
        if (removed) h.remove()
        else handle = h
      })
      .catch(() => {})
    return () => {
      removed = true
      handle?.remove()
    }
  }, [navigate])

  async function handleLogout() {
    setMenuOpen(false)
    await logOut()
    navigate('/login')
  }

  // 데스크탑/iPad landscape: 모든 항목 표시
  const desktopNav = isAdmin
    ? [...studentNav, ...studentExtraNav, ...adminExtraNav]
    : [...studentNav, ...studentExtraNav]
  // 모바일 + iPad portrait 하단 탭바: 관리자는 단어장 자리에 "관리"
  const mobileNav = isAdmin ? adminMobileNav : studentNav

  return (
    <div className="h-dvh flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* 상단 미니멀 헤더 */}
      <header className="bg-white border-b border-slate-200 safe-top safe-x">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="text-[15px] font-semibold tracking-tight text-slate-900 flex items-center gap-1.5"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />
            KJHEDU
          </Link>

          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline text-xs text-slate-500">
              {profile?.displayName}
              {isAdmin && (
                <span className="ml-1.5 inline-block rounded bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                  관리자
                </span>
              )}
            </span>
            <Link
              to="/notifications"
              aria-label="알림함"
              className="relative h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M10 21a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold inline-flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="메뉴"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="5" cy="12" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-200 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-sm flex-wrap">
              <span className="text-slate-600">{profile?.displayName}</span>
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  to="/history"
                  onClick={() => setMenuOpen(false)}
                  className="text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  내 기록
                </Link>
                <Link
                  to="/notice"
                  onClick={() => setMenuOpen(false)}
                  className="text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  공지사항
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin/announce"
                    onClick={() => setMenuOpen(false)}
                    className="text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                  >
                    공지 관리
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto overscroll-contain safe-x">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-6">
          <Outlet />
        </div>
      </main>

      {/* 데스크탑 / iPad landscape: 하단 가로 네비. lg 이상에서만 (iPad portrait 768은 모바일 탭바) */}
      <nav className="hidden lg:block sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-center gap-1">
          {desktopNav.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <span className="w-4 h-4 inline-flex">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* 모바일 + iPad portrait 하단 탭바 */}
      <nav className="lg:hidden border-t border-slate-200 bg-white safe-bottom safe-x">
        <div className="grid grid-cols-5 px-1 max-w-md mx-auto">
          {mobileNav.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium transition ${
                  isActive ? 'text-brand-700' : 'text-slate-500 active:bg-slate-100'
                }`
              }
            >
              <span className="w-5 h-5 inline-flex">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
