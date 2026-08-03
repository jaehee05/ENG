import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { WORDBOOK_ENABLED } from '../lib/features'
import { deleteAccount } from '../lib/account'
import { accountSubjects } from '../lib/types'
import { Capacitor } from '@capacitor/core'

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

  // 알림은 이 기기의 FCM 토큰을 계정에 붙였다 떼는 것으로 켜고 끈다.
  // 예전에는 localStorage 에만 적어둬서 꺼도 푸시가 그대로 왔다.
  const isNative = Capacitor.isNativePlatform()
  const [noti, setNoti] = useState(false)
  const [notiBusy, setNotiBusy] = useState(false)
  const [notiHint, setNotiHint] = useState<string | null>(null)

  useEffect(() => {
    if (!isNative) return
    let alive = true
    void import('../lib/pushSetup').then(async (m) => {
      const on = await m.canReceivePush()
      if (alive) setNoti(on)
    })
    return () => {
      alive = false
    }
  }, [isNative])

  async function toggleNoti() {
    if (notiBusy) return
    const next = !noti
    setNotiBusy(true)
    setNotiHint(null)
    try {
      const m = await import('../lib/pushSetup')
      const applied = await m.setPushEnabledForUser(next)
      setNoti(applied)
      // 켰는데 안 켜졌다면 기기 설정에서 알림이 막혀 있는 것이다. 앱 안에서는
      // 풀 수 없어서 어디를 봐야 하는지 알려준다.
      if (next && !applied) {
        setNotiHint('기기 설정 > 알림에서 KJHEDU 알림을 허용해 주세요.')
      }
    } finally {
      setNotiBusy(false)
    }
  }

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
    <div className="space-y-5 max-w-lg mx-auto">
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

      {/* 알림 설정 — 앱에서만. 웹은 푸시를 받지 않아 켤 것이 없다. */}
      {isNative && (
        <Card>
          <ToggleRow label="알림" on={noti} onToggle={toggleNoti} />
          {notiHint && (
            <p className="px-4 pb-3 -mt-1 text-[11px] text-slate-500">{notiHint}</p>
          )}
        </Card>
      )}

      {/* 공지 · 약관 */}
      <Card>
        <LinkRow to="/notice" label="공지사항 및 이벤트" />
        <LinkRow to="/privacy" label="개인정보 처리방침" />
        <LinkRow to="/support" label="고객지원 · 문의" />
      </Card>

      {/* 학습 콘텐츠 (하단탭에서 빠진 항목들) */}
      <Card>
        {showEnglish && <LinkRow to="/vocab" label="단어 시험지" />}
        {showEnglish && WORDBOOK_ENABLED && (
          <LinkRow to="/wordbook" label="내 단어장" />
        )}
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
