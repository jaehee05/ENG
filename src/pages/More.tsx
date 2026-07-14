import { useState, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { deleteAccount } from '../lib/account'
import { accountSubjects } from '../lib/types'

/** 로컬 저장 토글 (알림/마케팅 수신 선호). */
function useLocalToggle(key: string, initial = true) {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? initial : v === '1'
    } catch {
      return initial
    }
  })
  const toggle = () => {
    setOn((prev) => {
      const next = !prev
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }
  return [on, toggle] as const
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        on ? 'bg-brand-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/** 설정 카드 (회색 배경, 행 구분선). */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-100/80 overflow-hidden divide-y divide-slate-200/70">
      {children}
    </div>
  )
}

function LinkRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-slate-200/40 active:bg-slate-200/60"
    >
      <span className="text-[15px] font-medium text-slate-900">{label}</span>
      <span className="text-slate-400 text-lg">›</span>
    </Link>
  )
}

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <span className="text-[15px] font-medium text-slate-900">{label}</span>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  )
}

export function More() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const subj = profile ? accountSubjects(profile) : { korean: true, english: true }
  const showEnglish = subj.english || isAdmin
  const showMock = isAdmin || subj.korean

  const [noti, toggleNoti] = useLocalToggle('pref_noti', true)
  const [marketing, toggleMarketing] = useLocalToggle('pref_marketing', true)

  async function handleLogout() {
    await logOut()
    navigate('/login')
  }

  async function handleWithdraw() {
    if (!profile) return
    const ok = window.confirm(
      '정말 회원탈퇴 하시겠어요?\n계정과 학습 정보가 삭제되며 되돌릴 수 없습니다.',
    )
    if (!ok) return
    try {
      await deleteAccount(profile.id)
      await logOut()
      navigate('/login')
    } catch {
      window.alert('탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      {/* 인사말 */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">안녕하세요</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
            {profile?.displayName}님
          </h1>
        </div>
        {isAdmin && (
          <span className="mt-1 inline-block rounded-full bg-brand-50 text-brand-700 px-2.5 py-1 text-xs font-medium">
            관리자
          </span>
        )}
      </header>

      {/* 내 정보 관리 */}
      <Card>
        <LinkRow to="/profile" label="내 정보 관리" />
      </Card>

      {/* 알림 설정 */}
      <Card>
        <ToggleRow label="알림" on={noti} onToggle={toggleNoti} />
        <ToggleRow
          label="마케팅 정보 알림"
          on={marketing}
          onToggle={toggleMarketing}
        />
      </Card>

      {/* 공지 */}
      <Card>
        <LinkRow to="/notice" label="공지사항 및 이벤트" />
      </Card>

      {/* 학습 콘텐츠 (하단탭에서 빠진 항목들) */}
      <Card>
        {showEnglish && <LinkRow to="/reading" label="지문 문제풀이" />}
        {showEnglish && <LinkRow to="/vocab" label="단어 시험지" />}
        {showEnglish && <LinkRow to="/wordbook" label="내 단어장" />}
        {showMock && <LinkRow to="/korean-mocks" label="모의고사" />}
        <LinkRow to="/history" label="내 기록" />
      </Card>

      {/* 관리자 */}
      {isAdmin && (
        <Card>
          <LinkRow to="/admin" label="관리자 도구" />
        </Card>
      )}

      {/* 앱 버전 */}
      <Card>
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <span className="text-[15px] font-medium text-slate-900">앱 버전</span>
          <span className="text-sm text-slate-400 tabular-nums">
            {__APP_VERSION__}
          </span>
        </div>
      </Card>

      {/* 로그아웃 */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full rounded-2xl bg-red-50 px-4 py-4 text-[15px] font-semibold text-red-600 hover:bg-red-100"
      >
        로그아웃
      </button>

      <div className="text-center pt-1 pb-2">
        <button
          type="button"
          onClick={handleWithdraw}
          className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
        >
          회원탈퇴
        </button>
      </div>
    </div>
  )
}
