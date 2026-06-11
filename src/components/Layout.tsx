import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

const navItems = [
  { to: '/', label: '대시보드', end: true },
  { to: '/vocab', label: '단어 시험지' },
  { to: '/reading', label: '지문 문제풀이' },
  { to: '/wordbook', label: '내 단어장' },
]

export function Layout() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    setOpen(false)
    await logOut()
    navigate('/login')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `relative px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive
        ? 'text-slate-900 bg-white shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/70 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between gap-4">
            <Link
              to="/"
              className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent"
            >
              KJHEDU
            </Link>

            <nav className="hidden md:flex items-center gap-1 bg-slate-100/60 rounded-xl p-1">
              {navItems.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={navClass}>
                  {i.label}
                </NavLink>
              ))}
              {profile?.role === 'admin' && (
                <NavLink to="/admin/students" className={navClass}>
                  학생 관리
                </NavLink>
              )}
            </nav>

            <div className="hidden md:flex items-center gap-3">
              <span className="text-sm text-slate-600">
                {profile?.displayName}
                {profile?.role === 'admin' && (
                  <span className="ml-2 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700 align-middle">
                    관리자
                  </span>
                )}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                로그아웃
              </button>
            </div>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="메뉴"
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {open ? (
                  <>
                    <path d="M6 6 18 18" />
                    <path d="M6 18 18 6" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {open && (
            <div className="md:hidden pb-4 space-y-1 border-t border-slate-200/60 pt-3">
              {navItems.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  {i.label}
                </NavLink>
              ))}
              {profile?.role === 'admin' && (
                <NavLink
                  to="/admin/students"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  학생 관리
                </NavLink>
              )}
              <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  {profile?.displayName}
                  {profile?.role === 'admin' && (
                    <span className="ml-2 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700 align-middle">
                      관리자
                    </span>
                  )}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-slate-500 hover:text-slate-900"
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
