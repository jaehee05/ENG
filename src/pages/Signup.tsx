import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { formatPhoneKR } from '../lib/phone'

export function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [school, setSchool] = useState('')
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signUp({
        email,
        password,
        displayName: displayName.trim(),
        school: school.trim(),
        phone: phone.trim(),
        parentPhone: parentPhone.trim(),
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-400 focus:outline-none transition'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            KJHEDU
          </span>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          계정
        </p>
        <h1 className="text-[26px] font-semibold text-slate-900 mb-1.5 tracking-tight">
          회원가입
        </h1>
        <p className="text-sm text-slate-500 mb-7">
          이용하려면 가입 후 관리자 승인이 필요해요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              이름
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              학교
            </label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="예: 한솔고등학교"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                학생 연락처
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhone(formatPhoneKR(phone))}
                placeholder="010-1234-5678"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                학부모 연락처
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                onBlur={() => setParentPhone(formatPhoneKR(parentPhone))}
                placeholder="010-1234-5678"
                className={inputCls}
              />
            </div>
          </div>
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
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              비밀번호
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>

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
            {submitting ? '가입 중…' : '가입하기'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          이미 계정이 있으신가요?{' '}
          <Link
            to="/login"
            className="text-slate-900 font-medium hover:underline underline-offset-2"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}
