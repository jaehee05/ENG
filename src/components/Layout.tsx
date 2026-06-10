import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

export function Layout() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logOut()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-2.5 sm:px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            ENG
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 order-2 sm:order-3">
            <span className="text-sm text-slate-600 hidden sm:inline">
              {profile?.displayName}
              {profile?.role === 'admin' && (
                <span className="ml-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  관리자
                </span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              로그아웃
            </button>
          </div>
          <nav className="flex items-center gap-1 order-3 sm:order-2 w-full sm:w-auto overflow-x-auto -mx-1 px-1">
            <NavLink to="/" end className={linkClass}>
              대시보드
            </NavLink>
            <NavLink to="/vocab" className={linkClass}>
              단어 시험지
            </NavLink>
            <NavLink to="/reading" className={linkClass}>
              지문 문제풀이
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
