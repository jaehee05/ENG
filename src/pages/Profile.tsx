import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { accountSubjects } from '../lib/types'

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right truncate">
        {value || '—'}
      </span>
    </div>
  )
}

export function Profile() {
  const { profile } = useAuth()
  const subj = profile ? accountSubjects(profile) : { korean: false, english: false }
  const subjects = [subj.korean && '국어', subj.english && '영어']
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <header>
        <Link to="/more" className="text-xs text-slate-500 hover:text-slate-900">
          ← 더보기
        </Link>
        <h1 className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          내 정보 관리
        </h1>
      </header>

      <div className="flex items-center gap-3">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xl font-semibold">
          {profile?.displayName?.slice(0, 1) ?? '?'}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-slate-900 truncate">
            {profile?.displayName}
          </p>
          <p className="text-xs text-slate-500">
            {profile?.role === 'admin' ? '관리자' : '학생'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-100/80 overflow-hidden divide-y divide-slate-200/70">
        <Row label="이름" value={profile?.displayName} />
        <Row label="학교" value={profile?.school} />
        <Row label="수강 과목" value={subjects} />
        <Row label="학생 연락처" value={profile?.phone} />
        <Row label="학부모 연락처" value={profile?.parentPhone} />
        <Row label="이메일" value={profile?.email} />
      </div>

      <p className="text-xs text-slate-400 px-1">
        정보 수정이 필요하면 담당 선생님께 문의해 주세요.
      </p>
    </div>
  )
}
