import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

export function Rejected() {
  const { logOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-lg shadow-brand-900/5 border border-slate-200 p-8">
        <div className="text-center mb-4">
          <p className="text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
            KJHEDU
          </p>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">접근이 제한되었습니다</h1>
        <p className="text-slate-600 mt-3 leading-relaxed">
          현재 계정은 사용이 중지된 상태입니다.<br />
          관리자에게 문의해주세요.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition"
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
