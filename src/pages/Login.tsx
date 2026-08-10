import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { blurActiveElement } from '../lib/blurActive'

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
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            KJHEDU
          </span>
        </div>

        <h1 className="text-[26px] font-semibold text-slate-900 mb-1.5 tracking-tight">
          로그인
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          다시 오신 걸 환영해요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              이메일
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-400 focus:outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              비밀번호
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[16px] text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none transition"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="accent-brand-600 h-3.5 w-3.5"
            />
            로그인 유지
          </label>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 text-white text-[15px] font-medium py-3 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-60 transition mt-2"
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
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
  )
}
