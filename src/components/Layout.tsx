import { useEffect, useState, type ReactNode, type UIEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { useAuth } from '../contexts/useAuth'
import {
  BackNavContext,
  type BackOverride,
} from '../contexts/backNavContextValue'
import { unreadNotificationCount } from '../lib/firestore'
import { resolveBackTarget } from '../lib/backNav'
import { NAV_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { accountSubjects } from '../lib/types'
import { WORDBOOK_ENABLED } from '../lib/features'
import { Badge, confirm, cx } from './ui'

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

const backIcon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 18l-7-6 7-6" />
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
  const [backOverride, setBackOverride] = useState<BackOverride | null>(null)
  // 헤더는 바탕과 같은 색이라 평소엔 경계가 없다. 본문이 헤더 밑으로 밀려 올라갈
  // 때만 얇은 선을 그어, 내용이 헤더에 묻혀 보이지 않게 한다.
  const [scrolled, setScrolled] = useState(false)
  function onMainScroll(e: UIEvent<HTMLElement>) {
    const next = e.currentTarget.scrollTop > 4
    if (next !== scrolled) setScrolled(next)
  }

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

  // ── 헤더 뒤로가기 ──
  // 지금 떠 있는 네비에 그 경로가 있으면 뒤로가기를 감춘다 — 한 번에 닿는
  // 곳에 뒤로가기를 다는 건 군더더기다. 화면 폭에 따라 네비가 달라지므로
  // (아이폰은 탭 5개, 아이패드부터는 전체 메뉴) 판정도 폭을 따라간다.
  // 예: '기록'은 아이패드에선 탭이라 뒤로가기가 없고, 아이폰에선 '더보기'
  // 안에 있으므로 '← 더보기'가 붙는다.
  const wideNav = useMediaQuery(NAV_QUERY)
  const visibleNav = wideNav ? desktopNav : mobileNav
  const isNavRoot = visibleNav.some((i) => i.to === location.pathname)

  // location.key 가 'default' 인 건 앱에 들어와 처음 그린 화면일 때뿐이다.
  // 푸시 알림으로 바로 열렸거나 링크를 직접 열었거나 새로고침한 경우로,
  // 되돌아갈 앱 내부 기록이 없다. 그때만 표의 경로로 보낸다.
  const hasHistory = location.key !== 'default'

  const fallbackBack = resolveBackTarget(location.pathname, isAdmin)
  const backTo = backOverride?.to ?? fallbackBack?.to
  // 이름은 실제로 눌렀을 때 가는 곳을 말해야 한다. 기록을 되짚어 갈 땐 어디로
  // 가는지 알 길이 없으므로(라우터가 알려주지 않는다) 그냥 '뒤로' 라고 쓴다.
  // 목적지 이름은 표의 경로로 보내는 경우 — 기록이 없을 때 — 에만 쓴다.
  // 예: 기록에서 결과로 들어오면 '뒤로'(→기록), 푸시로 결과가 바로 열리면
  // '시험지'(→시험지 상세).
  const back =
    !isNavRoot && backTo
      ? {
          to: backTo,
          label: hasHistory
            ? '뒤로'
            : (backOverride?.label ?? fallbackBack?.label ?? '뒤로'),
          confirmMessage: backOverride?.confirmMessage,
        }
      : null

  async function goBack() {
    if (!back) return
    if (back.confirmMessage && !(await confirm(back.confirmMessage, { confirmText: '나가기', danger: true })))
      return
    if (hasHistory) navigate(-1)
    else navigate(back.to)
  }

  return (
    <div className="h-dvh flex flex-col bg-surface text-slate-900 overflow-hidden">
      {/* 상단 헤더 — 바탕과 같은 색. 스크롤하면 아래 선만 생긴다. */}
      <header
        className={cx(
          'bg-surface border-b safe-top safe-x transition-colors',
          scrolled ? 'border-slate-200/80' : 'border-transparent',
        )}
      >
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl mx-auto px-5 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          {/* 뒤로가기가 있는 화면에선 로고 자리를 내준다 — 아이폰 폭에서 둘을
              같이 두면 이름이 잘린다. 로고는 어차피 홈으로 가는 링크였고,
              홈은 탭바에 있다. */}
          {back ? (
            <button
              type="button"
              onClick={goBack}
              className="pressable -ml-2.5 h-11 pl-1.5 pr-3 min-w-0 inline-flex items-center gap-0.5 rounded-xl text-[16px] font-semibold text-slate-800 hover:bg-slate-200/60 active:bg-slate-200/60"
            >
              {/* 목적지 이름만 적힌 경우('시험지') 읽어주는 기기에는 그게 뒤로
                  가는 버튼이라는 걸 따로 알려준다. 이름이 이미 '뒤로' 면
                  덧붙이지 않는다 — "뒤로가기 뒤로" 로 읽힌다. */}
              {back.label !== '뒤로' && <span className="sr-only">뒤로가기 </span>}
              <span className="shrink-0" aria-hidden>
                {backIcon}
              </span>
              <span className="truncate">{back.label}</span>
            </button>
          ) : (
            <Link
              to="/"
              className="text-[17px] font-bold tracking-tight text-slate-900 flex items-center gap-1.5"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />
              KJHEDU
            </Link>
          )}

          <div className="flex items-center gap-1">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 mr-1">
              {profile?.displayName}
              {isAdmin && <Badge tone="brand">관리자</Badge>}
            </span>
            <Link
              to="/notifications"
              aria-label="알림함"
              className="pressable relative -mr-2 h-10 w-10 inline-flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-200/60 active:bg-slate-200/60"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M10 21a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto overscroll-contain safe-x" onScroll={onMainScroll}>
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl mx-auto px-5 sm:px-6 lg:px-8 pt-2 sm:pt-5 pb-8">
          <BackNavContext.Provider value={setBackOverride}>
            <Outlet />
          </BackNavContext.Provider>
        </div>
      </main>

      {/* 아이패드 세로(768) 이상: 하단 가로 네비 — 전체 메뉴 노출.
          관리자는 항목이 10개까지 늘어나 768px에서 빠듯하므로, 넘치면 가로 스크롤되게 둔다.
          (안쪽 flex에 mx-auto → 들어갈 땐 가운데 정렬, 넘칠 땐 왼쪽부터) */}
      <nav className="hidden md:block sticky bottom-0 bg-white/95 backdrop-blur shadow-bar safe-bottom safe-x">
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 lg:px-6 h-12 flex items-center overflow-x-auto">
          <div className="flex items-center gap-0.5 lg:gap-1 mx-auto">
            {desktopNav.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  `pressable inline-flex items-center gap-1.5 px-2.5 lg:px-3 h-9 rounded-xl text-[13px] lg:text-sm whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-bold [&_svg]:stroke-[2.2]'
                      : 'text-slate-500 font-medium hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100'
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

      {/* 아이폰(768 미만) 하단 탭바 — 선 대신 옅은 그림자로 본문과 나눈다. */}
      <nav className="md:hidden bg-white shadow-bar safe-bottom safe-x">
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
                // 선택된 탭만 진하게 — 색을 입히기보다 글자·아이콘 굵기로 구분한다.
                `pressable flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] ${
                  isActive
                    ? 'text-slate-900 font-bold [&_svg]:stroke-[2.2]'
                    : 'text-slate-400 font-medium'
                }`
              }
            >
              <span className="w-6 h-6 inline-flex">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
