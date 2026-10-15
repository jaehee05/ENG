import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { blurActiveElement } from '../lib/blurActive'
import { formatPhoneKR } from '../lib/phone'
import { normalizeSchool } from '../lib/school'
import { Button, inputClass } from '../components/ui'

export function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [school, setSchool] = useState('')
  // 줄여 적은 학교 이름은 저장할 때 정식 명칭으로 펴진다(lib/school.ts).
  const normalizedSchool = normalizeSchool(school)
  const schoolPreview =
    normalizedSchool && normalizedSchool !== school.trim() ? normalizedSchool : ''
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      await signUp({
        email,
        password,
        displayName: displayName.trim(),
        school,
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

  const inputCls = inputClass()

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
          회원가입
        </h1>
        <p className="text-[15px] text-slate-500 mb-7">
          이용하려면 가입 후 관리자 승인이 필요해요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-slate-600">
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
            <label className="block text-[13px] font-medium text-slate-600">
              학교
            </label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="예: 한솔고 (한솔고등학교로 저장됩니다)"
              className={inputCls}
            />
            {/* 저장할 이름을 미리 보여 준다. 줄여 적었는데 목록에 다르게
                뜨면 잘못 들어간 줄 안다. */}
            {schoolPreview && (
              <p className="text-[12px] text-slate-500">
                <span className="text-slate-400">저장될 이름</span> {schoolPreview}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-slate-600">
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
              <label className="block text-[13px] font-medium text-slate-600">
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
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-slate-600">
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
            <p className="text-[13px] text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" block loading={submitting} className="mt-2">
            가입하기
          </Button>

          {/* 가입 전에 무엇을 수집하는지 읽을 수 있어야 한다. 방침 화면은
              로그인 밖에 있어 여기서도 바로 열린다. */}
          <p className="text-[12px] text-slate-400 text-center leading-relaxed">
            가입하면{' '}
            <Link
              to="/privacy"
              className="text-slate-600 underline underline-offset-2"
            >
              개인정보 처리방침
            </Link>
            에 동의하는 것으로 봅니다.
          </p>
        </form>

        <p className="mt-6 text-[14px] text-slate-500 text-center">
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
    </div>
  )
}
