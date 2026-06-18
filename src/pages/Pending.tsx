import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

export function Pending() {
  const { profile, logOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logOut()
    navigate('/login')
  }

  if (!profile) return null
  if (profile.status === 'active') {
    navigate('/', { replace: true })
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-lg shadow-brand-900/5 border border-slate-200 p-8">
        <div className="text-center mb-4">
          <p className="text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
            KJHEDU
          </p>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">승인 대기 중</h1>
        <p className="text-slate-600 mt-3 leading-relaxed">관리자 승인 후 사용 가능합니다.</p>
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={() => refreshProfile()}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            상태 새로고침
          </button>
          <button
            onClick={handleLogout}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
