import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Layout() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logOut()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            ENG
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              대시보드
            </NavLink>
            <NavLink to="/vocab" className={linkClass}>
              단어 시험지
            </NavLink>
            <NavLink to="/reading" className={linkClass}>
              지문 문제풀이
            </NavLink>
            {profile?.role === 'admin' && (
              <NavLink to="/admin" className={linkClass}>
                관리
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3">
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
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
