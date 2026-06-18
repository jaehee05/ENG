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
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-white">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            KJHEDU
          </span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          상태
        </p>
        <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight">
          승인 대기 중
        </h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          관리자 승인 후 사용 가능합니다.
        </p>
        <div className="mt-7 flex gap-2 justify-center">
          <button
            onClick={() => refreshProfile()}
            className="rounded-lg border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2.5 hover:bg-slate-50"
          >
            새로고침
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-800"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
