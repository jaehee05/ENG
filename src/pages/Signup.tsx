import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

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
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg shadow-brand-900/5 border border-slate-200 p-8">
        <div className="text-center mb-6">
          <p className="text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
            KJHEDU
          </p>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-5">회원가입</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">학교</label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="예: 한솔고등학교"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">학생 연락처</label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">학부모 연락처</label>
              <input
                type="tel"
                inputMode="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="010-1234-5678"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 text-white text-sm font-medium py-2.5 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting ? '가입 중...' : '가입하기'}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600 text-center">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}
