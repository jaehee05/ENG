import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { blurActiveElement } from '../lib/blurActive'
import { Button, inputClass } from '../components/ui'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // 화면이 바뀌기 전에 포커스를 푼다 — iOS 는 그러지 않으면 키보드 위
    // 액세서리 바가 다음 화면에 남는다.
    blurActiveElement()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password, keepSignedIn)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-white">
      {/* 앱은 body 스크롤을 막아 두므로(index.css 의 .native-app) 로그인 밖 화면은
          스스로 스크롤 영역을 가진다 — 없으면 작은 아이폰에서 폼 아래가 잘린다. */}
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-10 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          <span className="text-[17px] font-bold tracking-tight text-slate-900">KJHEDU</span>
        </div>

        <h1 className="text-[26px] font-bold text-slate-900 mb-1.5 tracking-tight">
          로그인
        </h1>
        <p className="text-[15px] text-slate-500 mb-8">
          다시 오신 걸 환영해요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-slate-600">
              이메일
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-slate-600">
              비밀번호
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass()}
            />
          </div>

          <label className="flex items-center gap-2 text-[14px] text-slate-600 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="accent-brand-600 h-4 w-4"
            />
            로그인 유지
          </label>

          {error && (
            <p className="text-[13px] text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" block loading={submitting} className="mt-2">
            로그인
          </Button>
        </form>

        <p className="mt-6 text-[14px] text-slate-500 text-center">
          계정이 없으신가요?{' '}
          <Link
            to="/signup"
            className="text-slate-900 font-medium hover:underline underline-offset-2"
          >
            회원가입
          </Link>
        </p>
      </div>
      </div>
    </div>
  )
}
