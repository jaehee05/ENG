import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { Button } from '../components/ui'

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
    <div className="h-dvh overflow-y-auto overscroll-contain bg-white">
      {/* 앱은 body 스크롤을 막아 두므로(index.css 의 .native-app) 로그인 밖 화면은
          스스로 스크롤 영역을 가진다 — 없으면 작은 아이폰에서 폼 아래가 잘린다. */}
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-10 safe-top safe-bottom">
      <div className="w-full max-w-sm text-center">
        <div className="mb-10 flex items-center justify-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          <span className="text-[17px] font-bold tracking-tight text-slate-900">KJHEDU</span>
        </div>
        <h1 className="text-[24px] font-bold text-slate-900 tracking-tight">
          승인을 기다리고 있어요
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 leading-relaxed">
          관리자가 승인하면 쓸 수 있어요.
        </p>
        <div className="mt-8 flex gap-2">
          <Button variant="secondary" size="lg" block onClick={handleLogout}>
            로그아웃
          </Button>
          <Button size="lg" block onClick={() => refreshProfile()}>
            새로고침
          </Button>
        </div>
      </div>
      </div>
    </div>
  )
}
