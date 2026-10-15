import { useAuth } from '../contexts/useAuth'
import { accountSubjects } from '../lib/types'
import { Card, PageHeader } from '../components/ui'

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 min-h-[56px]">
      <span className="shrink-0 text-[15px] text-slate-500">{label}</span>
      <span className="min-w-0 text-[15px] font-medium text-slate-900 text-right truncate">
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
      <PageHeader title="내 정보" />

      <Card className="flex items-center gap-4">
        <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[22px] font-bold">
          {profile?.displayName?.slice(0, 1) ?? '?'}
        </span>
        <div className="min-w-0">
          <p className="text-[19px] font-bold text-slate-900 truncate">{profile?.displayName}</p>
          <p className="text-[13px] text-slate-500 mt-0.5">{profile?.role === 'admin' ? '관리자' : '학생'}</p>
        </div>
      </Card>

      <Card padded={false}>
        <Row label="이름" value={profile?.displayName} />
        <Row label="학교" value={profile?.school} />
        <Row label="수강 과목" value={subjects} />
        <Row label="학생 연락처" value={profile?.phone} />
        <Row label="학부모 연락처" value={profile?.parentPhone} />
        <Row label="이메일" value={profile?.email} />
      </Card>

      <p className="text-[13px] text-slate-500 px-1">정보를 고쳐야 하면 담당 선생님께 말씀해 주세요.</p>
    </div>
  )
}
