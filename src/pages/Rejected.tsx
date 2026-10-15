import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { Button } from '../components/ui'

export function Rejected() {
  const { logOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logOut()
    navigate('/login')
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
          이용이 제한됐어요
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 leading-relaxed">
          이 계정은 지금 사용이 멈춰 있어요.
          <br />
          관리자에게 문의해 주세요.
        </p>
        <Button variant="secondary" size="lg" block onClick={handleLogout} className="mt-8">
          로그아웃
        </Button>
      </div>
      </div>
    </div>
  )
}
