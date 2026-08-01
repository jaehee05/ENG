import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { useAuth } from '../contexts/useAuth'
import { unreadNotificationCount } from '../lib/firestore'
import { accountSubjects } from '../lib/types'
import { WORDBOOK_ENABLED } from '../lib/features'

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
const mockIcon = (
  <svg {...iconProps}>
    <path d="M9 2h6l2 2h3v18H4V4h3l2-2Z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)
const moreIcon = (
  <svg {...iconProps}>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
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
  { to: '/vocab', label: '단어', icon: vocabIcon },
  { to: '/schedule', label: '일정', icon: calendarIcon },
]

// 아이폰 하단 탭바. 학생은 여기에 '단어' 를 더해 5개 — 매일 들어가는 곳이라
// 더보기 안에 두면 두 번 눌러야 한다. 관리자는 /vocab 이 학생별 현황이라
// 성격이 달라 4개로 둔다.
const bottomTabs: NavItem[] = [
  { to: '/', label: '홈', end: true, icon: homeIcon },
  { to: '/assignments', label: '과제', icon: checkIcon },
  { to: '/schedule', label: '일정', icon: calendarIcon },
  { to: '/more', label: '더보기', icon: moreIcon },
]

const studentExtraNav: NavItem[] = [
  // 내 단어장은 화면에서만 감췄다 — features.ts 의 WORDBOOK_ENABLED 참고.
  ...(WORDBOOK_ENABLED
    ? [{ to: '/wordbook', label: '단어장', icon: wordbookIcon }]
    : []),
  { to: '/history', label: '기록', icon: historyIcon },
]

// 학생 관리는 '관리' 허브 안에 있다. 탭에 따로 두면 관리→학생을 두 번 누르는
// 꼴이라 중복이므로 뺐다.
const adminExtraNav: NavItem[] = [
  { to: '/admin', label: '관리', icon: adminGearIcon },
  { to: '/admin/notify', label: '알림', icon: notifyIcon },
]

export function Layout() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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

  // 학생 계정 과목 확인 — 국어만이면 영어 콘텐츠 탭 숨김. 국어 포함이면 모의고사 탭 노출.
  const subj = profile ? accountSubjects(profile) : { korean: true, english: true }
  const englishOnlyPaths = new Set<string>([
    // 홈(/)은 국어 전용 학생에게도 노출(학습 바로가기 숨기고 과제 리스트 표시).
    '/vocab',
    '/wordbook',
    '/history',
  ])
  const filterForSubjects = (items: NavItem[]) => {
    const bySubject =
      subj.english || isAdmin
        ? items
        : items.filter((i) => !englishOnlyPaths.has(i.to))
    return bySubject
  }

  const mockNavItem: NavItem = {
    to: '/korean-mocks',
    label: '모의고사',
    icon: mockIcon,
  }
  const koreanOnly = !isAdmin && subj.korean && !subj.english

  // 헤더의 점 3개 메뉴를 없애면서 md 이상에서도 '더보기' 로 들어가게 한다.
  // 내 정보·공지사항·로그아웃이 거기 있어, 이게 없으면 데스크톱에서 로그아웃할
  // 길이 사라진다.
  const moreNavItem: NavItem = { to: '/more', label: '더보기', icon: moreIcon }

  // 아이패드 세로(md, 768) 이상: 모든 항목 표시
  const desktopNav = isAdmin
    ? [...studentNav, ...studentExtraNav, ...adminExtraNav, moreNavItem]
    : koreanOnly
      ? [...filterForSubjects(studentNav), mockNavItem, moreNavItem]
      : [...filterForSubjects([...studentNav, ...studentExtraNav]), moreNavItem]
  // 아이폰(md 미만) 하단 탭바. 학생은 홈·과제·단어·일정·더보기.
  // filterForSubjects 를 거치는 이유 — 국어만 듣는 학생에게는 단어를 숨긴다.
  const mobileNav = isAdmin
    ? bottomTabs
    : filterForSubjects([
        bottomTabs[0],
        bottomTabs[1],
        { to: '/vocab', label: '단어', icon: vocabIcon },
        bottomTabs[2],
        bottomTabs[3],
      ])

  return (
    <div className="h-dvh flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* 상단 미니멀 헤더 */}
      <header className="bg-white border-b border-slate-200 safe-top safe-x">
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
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
              className="relative h-9 w-9 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M10 21a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto overscroll-contain safe-x">
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-6">
          <Outlet />
        </div>
      </main>

      {/* 아이패드 세로(768) 이상: 하단 가로 네비 — 전체 메뉴 노출.
          관리자는 항목이 10개까지 늘어나 768px에서 빠듯하므로, 넘치면 가로 스크롤되게 둔다.
          (안쪽 flex에 mx-auto → 들어갈 땐 가운데 정렬, 넘칠 땐 왼쪽부터) */}
      <nav className="hidden md:block sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom safe-x">
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 lg:px-6 h-12 flex items-center overflow-x-auto">
          <div className="flex items-center gap-0.5 lg:gap-1 mx-auto">
            {desktopNav.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-2 lg:px-3 h-9 rounded-md text-[13px] lg:text-sm font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                <span className="w-4 h-4 inline-flex shrink-0">{i.icon}</span>
                {i.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* 아이폰(768 미만) 하단 탭바 */}
      <nav className="md:hidden border-t border-slate-200 bg-white safe-bottom safe-x">
        <div
          className="grid px-1 max-w-md mx-auto"
          style={{
            gridTemplateColumns: `repeat(${Math.max(mobileNav.length, 1)}, minmax(0, 1fr))`,
          }}
        >
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
