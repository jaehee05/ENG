import { useEffect, useMemo, useState } from 'react'
import { listAccounts } from '../lib/account'
import {
  isAssignmentDone,
  listAssignmentsForStudent,
  listAttemptsForUser,
} from '../lib/firestore'
import {
  DEFAULT_ASSIGNMENT_STATUS_SCHEDULE,
  DEFAULT_WEEKLY_REPORT_SCHEDULE,
  fetchPpurioSettings,
  fetchScheduleSettings,
  getAdminSecret,
  savePpurioSettings,
  saveScheduleSettings,
  sendBatchAlimtalk,
  setAdminSecret,
  type AssignmentStatusSchedule,
  type PpurioSettingsView,
  type SendResultItem,
  type WeeklyReportSchedule,
} from '../lib/ppurioApi'
import { buildWeeklyReportVars } from '../lib/weeklyReport'
import type { Assignment, Attempt, UserAccount } from '../lib/types'

interface StudentBundle {
  account: UserAccount
  assignments: Assignment[]
  attempts: Attempt[]
}

const VAR_BYTE_LIMIT = 100

function fitToBytes(items: string[], emptyText: string): string {
  if (items.length === 0) return emptyText
  const enc = new TextEncoder()
  const full = items.join('\n')
  if (enc.encode(full).length <= VAR_BYTE_LIMIT) return full
  for (let n = items.length - 1; n >= 1; n--) {
    const text = [...items.slice(0, n), `외 ${items.length - n}개`].join('\n')
    if (enc.encode(text).length <= VAR_BYTE_LIMIT) return text
  }
  return `(총 ${items.length}개)`
}

function doneLines(b: StudentBundle): string {
  const lines = b.assignments
    .filter((a) => isAssignmentDone(a, b.attempts))
    .map((a) => `▶ ${a.refTitle}`)
  return fitToBytes(lines, '(완료한 과제가 없습니다)')
}

function incompleteLines(b: StudentBundle): string {
  const lines = b.assignments
    .filter((a) => !isAssignmentDone(a, b.attempts))
    .map((a) => `▶ ${a.refTitle}`)
  return fitToBytes(lines, '(미완료 과제가 없습니다)')
}

const TEMPLATE_PREVIEW = `[*이름*]님, 과제 현황 안내입니다.

[완료 과제]
[*1*]

[미완료 과제]
[*2*]

[*3*]`

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const LS_TEMPLATE_CODE = 'eng_notify_template_code'
const LS_MSG_TYPE = 'eng_notify_msg_type'
const LS_NOTICE = 'eng_notify_notice'

type MsgType = '기본형' | '이미지형' | '강조표기형' | '아이템리스트형'

const MSG_TYPES: MsgType[] = ['기본형', '이미지형', '강조표기형', '아이템리스트형']

const MSG_TYPE_CODE: Record<MsgType, string> = {
  기본형: 'AT',
  이미지형: 'AI',
  강조표기형: 'ALH',
  아이템리스트형: 'ALI',
}

export function AdminNotify() {
  const [bundles, setBundles] = useState<StudentBundle[]>([])
  const [templateCode, setTemplateCode] = useState(
    () => localStorage.getItem(LS_TEMPLATE_CODE) ?? '',
  )
  const [msgType, setMsgType] = useState<MsgType>(() => {
    const v = localStorage.getItem(LS_MSG_TYPE) as MsgType | null
    return v && MSG_TYPES.includes(v) ? v : '강조표기형'
  })
  const [notice, setNotice] = useState(
    () => localStorage.getItem(LS_NOTICE) ?? '',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testName, setTestName] = useState('테스트')

  const [schedule, setSchedule] = useState<AssignmentStatusSchedule>(
    DEFAULT_ASSIGNMENT_STATUS_SCHEDULE,
  )
  const [scheduleLoaded, setScheduleLoaded] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null)

  const [weekly, setWeekly] = useState<WeeklyReportSchedule>(
    DEFAULT_WEEKLY_REPORT_SCHEDULE,
  )
  const [weeklySaving, setWeeklySaving] = useState(false)
  const [weeklyNotice, setWeeklyNotice] = useState<string | null>(null)
  const [weeklyTestPhone, setWeeklyTestPhone] = useState('')
  const [weeklyTestName, setWeeklyTestName] = useState('테스트')
  const [weeklySendResults, setWeeklySendResults] = useState<
    SendResultItem[] | null
  >(null)
  const [weeklySending, setWeeklySending] = useState(false)

  const [adminSecret, setAdminSecretState] = useState(() => getAdminSecret())
  const [ppurioAccount, setPpurioAccount] = useState('')
  const [senderProfile, setSenderProfile] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [footerLine, setFooterLine] = useState('')
  const [credsLoaded, setCredsLoaded] = useState(false)
  const [credsLoading, setCredsLoading] = useState(false)
  const [credsSaving, setCredsSaving] = useState(false)
  const [credsNotice, setCredsNotice] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [credsOpen, setCredsOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResults, setSendResults] = useState<SendResultItem[] | null>(null)

  function applyView(v: PpurioSettingsView) {
    setPpurioAccount(v.ppurioAccount)
    setSenderProfile(v.senderProfile)
    setApiKeyMasked(v.apiKeyMasked)
    setHasApiKey(v.hasApiKey)
    setFooterLine(v.footer)
  }

  async function loadCreds() {
    if (!adminSecret) return
    setCredsLoading(true)
    setCredsNotice(null)
    try {
      const v = await fetchPpurioSettings()
      applyView(v)
      setCredsLoaded(true)
    } catch (e) {
      setCredsNotice(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setCredsLoading(false)
    }
    try {
      const sc = await fetchScheduleSettings()
      if (sc.assignmentStatus) {
        setSchedule({
          ...DEFAULT_ASSIGNMENT_STATUS_SCHEDULE,
          ...sc.assignmentStatus,
        })
      }
      if (sc.weeklyReport) {
        setWeekly({
          ...DEFAULT_WEEKLY_REPORT_SCHEDULE,
          ...sc.weeklyReport,
        })
      }
      setScheduleLoaded(true)
    } catch {
      setScheduleLoaded(true)
    }
  }

  async function handleSaveWeekly() {
    setWeeklySaving(true)
    setWeeklyNotice(null)
    try {
      await saveScheduleSettings({ weeklyReport: weekly })
      setWeeklyNotice('주간 리포트 설정 저장됨')
      setTimeout(
        () => setWeeklyNotice((cur) => (cur === '주간 리포트 설정 저장됨' ? null : cur)),
        2000,
      )
    } catch (e) {
      setWeeklyNotice(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setWeeklySaving(false)
    }
  }

  async function handleWeeklyTest() {
    if (!adminSecret) {
      setWeeklyNotice('관리자 비밀키를 먼저 입력하세요.')
      return
    }
    if (!weekly.templateCode.trim()) {
      setWeeklyNotice('주간 리포트 템플릿 코드를 입력하세요.')
      return
    }
    const phone = (weeklyTestPhone || '').replace(/\D/g, '')
    if (phone.length < 9) {
      setWeeklyNotice('테스트 수신번호를 올바르게 입력하세요.')
      return
    }
    const sample = bundles[0]
      ? buildWeeklyReportVars(bundles[0].assignments, bundles[0].attempts)
      : {
          var1: '📊 지난주 과제 성취도\n▫️ 단어 암기: [ 0% 완료 ]\n▫️ 문제 풀이: [ 0% 완료 ]',
          var2: '🔤 단어 시험 Report\n▫️ 학습 범위: 총 0회분 (단어 0개)\n▫️ 암기 현황: 총 0개 완료\n▫️ 최종 결과: 🎯 총 0회 중 [ 0회 ] 통과',
          var3: '📝 문제 풀이 Report\n▫️ 독해 지문: 총 0개 완수\n▫️ 학습 결과: 📈 정답률 0% (0/0문항)',
        }
    setWeeklySending(true)
    setWeeklySendResults(null)
    try {
      const out = await sendBatchAlimtalk({
        templateCode: weekly.templateCode.trim(),
        messageType: weekly.messageType,
        recipients: [
          {
            label: '테스트',
            phone,
            name: weeklyTestName.trim() || '테스트',
            changeWord: {
              var1: sample.var1,
              var2: sample.var2,
              var3: sample.var3,
              var4: weekly.closing,
            },
          },
        ],
      })
      setWeeklySendResults(out.results)
      setWeeklyNotice(out.sent > 0 ? '테스트 발송 완료.' : '테스트 발송 실패.')
    } catch (e) {
      setWeeklyNotice(e instanceof Error ? e.message : '테스트 발송 실패')
    } finally {
      setWeeklySending(false)
    }
  }

  async function handleWeeklySendAll() {
    if (!adminSecret) {
      setWeeklyNotice('관리자 비밀키를 먼저 입력하세요.')
      return
    }
    if (!weekly.templateCode.trim()) {
      setWeeklyNotice('주간 리포트 템플릿 코드를 입력하세요.')
      return
    }
    const targets = bundles.filter(
      (b) =>
        (b.account.phone ?? '').trim() || (b.account.parentPhone ?? '').trim(),
    )
    if (targets.length === 0) {
      setWeeklyNotice('연락처가 있는 학생이 없습니다.')
      return
    }
    const recipients = targets.flatMap((b) => {
      const v = buildWeeklyReportVars(b.assignments, b.attempts)
      const changeWord = {
        var1: v.var1,
        var2: v.var2,
        var3: v.var3,
        var4: weekly.closing,
      }
      const out: {
        label: string
        phone: string
        name: string
        changeWord: Record<string, string>
      }[] = []
      if ((b.account.phone ?? '').trim()) {
        out.push({
          label: `${b.account.displayName}(학생)`,
          phone: b.account.phone ?? '',
          name: b.account.displayName,
          changeWord,
        })
      }
      if ((b.account.parentPhone ?? '').trim()) {
        out.push({
          label: `${b.account.displayName}(학부모)`,
          phone: b.account.parentPhone ?? '',
          name: b.account.displayName,
          changeWord,
        })
      }
      return out
    })
    if (
      !window.confirm(
        `학생 ${targets.length}명 · 총 ${recipients.length}건(학생+학부모)에게 주간 리포트를 발송합니다. 계속할까요?`,
      )
    )
      return
    setWeeklySending(true)
    setWeeklySendResults(null)
    try {
      const out = await sendBatchAlimtalk({
        templateCode: weekly.templateCode.trim(),
        messageType: weekly.messageType,
        recipients,
      })
      setWeeklySendResults(out.results)
      setWeeklyNotice(`발송 완료: 성공 ${out.sent} / 실패 ${out.failed}`)
    } catch (e) {
      setWeeklyNotice(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setWeeklySending(false)
    }
  }

  async function handleSaveSchedule() {
    setScheduleSaving(true)
    setScheduleNotice(null)
    try {
      await saveScheduleSettings({ assignmentStatus: schedule })
      setScheduleNotice('스케줄 저장됨')
      setTimeout(
        () => setScheduleNotice((cur) => (cur === '스케줄 저장됨' ? null : cur)),
        2000,
      )
    } catch (e) {
      setScheduleNotice(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setScheduleSaving(false)
    }
  }

  useEffect(() => {
    if (adminSecret) {
      void loadCreds()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persistSecret(v: string) {
    setAdminSecret(v)
    setAdminSecretState(v)
  }

  async function saveCreds() {
    setCredsNotice(null)
    setCredsSaving(true)
    try {
      await savePpurioSettings({
        ppurioAccount,
        senderProfile,
        apiKey: apiKey || undefined,
        footer: footerLine,
      })
      setApiKey('')
      const v = await fetchPpurioSettings()
      applyView(v)
      setCredsLoaded(true)
      setCredsNotice('저장되었습니다.')
      setTimeout(() => setCredsNotice((cur) => (cur === '저장되었습니다.' ? null : cur)), 2000)
    } catch (e) {
      setCredsNotice(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setCredsSaving(false)
    }
  }

  useEffect(() => {
    localStorage.setItem(LS_TEMPLATE_CODE, templateCode)
  }, [templateCode])
  useEffect(() => {
    localStorage.setItem(LS_MSG_TYPE, msgType)
  }, [msgType])
  useEffect(() => {
    localStorage.setItem(LS_NOTICE, notice)
  }, [notice])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const accounts = await listAccounts()
        const targets = accounts.filter(
          (a) => a.role === 'student' && a.status === 'active',
        )
        const bundles = await Promise.all(
          targets.map(async (account) => {
            const [assignments, attempts] = await Promise.all([
              listAssignmentsForStudent(account.id),
              listAttemptsForUser(account.id),
            ])
            return { account, assignments, attempts }
          }),
        )
        if (!cancelled) setBundles(bundles)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    if (!hideCompleted) return bundles
    return bundles.filter((b) =>
      b.assignments.some((a) => !isAssignmentDone(a, b.attempts)),
    )
  }, [bundles, hideCompleted])

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {
      window.alert('클립보드 복사에 실패했습니다.')
    }
  }

  async function handleTestSend() {
    if (!adminSecret) {
      setCredsNotice('관리자 비밀키를 먼저 입력하세요.')
      return
    }
    if (!templateCode.trim()) {
      setCredsNotice('템플릿 코드를 입력하세요.')
      return
    }
    const phone = (testPhone || '').replace(/\D/g, '')
    if (phone.length < 9) {
      setCredsNotice('테스트 수신번호를 올바르게 입력하세요.')
      return
    }
    setSending(true)
    setSendResults(null)
    try {
      const sampleDone = bundles[0]
        ? doneLines(bundles[0])
        : '▶ 샘플 단어 시험 DAY 1'
      const sampleIncomplete = bundles[0]
        ? incompleteLines(bundles[0])
        : '▶ 샘플 지문 문제풀이'
      const out = await sendBatchAlimtalk({
        templateCode: templateCode.trim(),
        messageType: MSG_TYPE_CODE[msgType],
        recipients: [
          {
            label: '테스트',
            phone,
            name: testName.trim() || '테스트',
            changeWord: {
              var1: sampleDone,
              var2: sampleIncomplete,
              var3: notice || '(안내사항 미입력)',
            },
          },
        ],
      })
      setSendResults(out.results)
      const ok = out.sent > 0
      setCredsNotice(ok ? '테스트 발송 완료.' : '테스트 발송 실패. 결과 확인.')
    } catch (e) {
      setCredsNotice(e instanceof Error ? e.message : '테스트 발송 실패')
    } finally {
      setSending(false)
    }
  }

  async function handleSend() {
    if (!adminSecret) {
      setCredsNotice('관리자 비밀키를 먼저 입력하세요.')
      return
    }
    if (!templateCode.trim()) {
      setCredsNotice('템플릿 코드를 입력하세요.')
      return
    }
    const targets = visible.filter((b) => (b.account.phone ?? '').trim())
    if (targets.length === 0) {
      setCredsNotice('연락처가 있는 학생이 없습니다.')
      return
    }
    if (
      !window.confirm(
        `${targets.length}명에게 알림톡을 발송합니다. 계속하시겠습니까?`,
      )
    )
      return
    setSending(true)
    setSendResults(null)
    try {
      const recipients = targets.map((b) => ({
        label: b.account.displayName,
        phone: b.account.phone ?? '',
        name: b.account.displayName,
        changeWord: {
          var1: doneLines(b),
          var2: incompleteLines(b),
          var3: notice,
        },
      }))
      const out = await sendBatchAlimtalk({
        templateCode: templateCode.trim(),
        messageType: MSG_TYPE_CODE[msgType],
        recipients,
      })
      setSendResults(out.results)
      setCredsNotice(`발송 완료: 성공 ${out.sent} / 실패 ${out.failed}`)
    } catch (e) {
      setCredsNotice(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSending(false)
    }
  }

  function downloadCsv() {
    const rows = [['발송유형', '템플릿코드', '수신번호', '이름', '1', '2', '3']]
    for (const b of visible) {
      rows.push([
        msgType,
        templateCode,
        b.account.phone ?? '',
        b.account.displayName,
        doneLines(b),
        incompleteLines(b),
        notice,
      ])
    }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date()
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    a.href = url
    a.download = `뿌리오_알림톡_과제현황_${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">알림톡 발송 도우미 (뿌리오)</h1>
        <p className="text-sm text-slate-500 mt-1">
          학생별 과제 현황을 자동으로 채워 뿌리오 알림톡 변수 CSV를 만듭니다. 다운로드 받아
          뿌리오 대량발송에 그대로 업로드하세요.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-600 mb-2">
          템플릿 양식 (강조표기형)
        </p>
        <pre className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
          {TEMPLATE_PREVIEW}
        </pre>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <button
          type="button"
          onClick={() => setCredsOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-semibold text-slate-700">
            뿌리오 발신 설정
            <span className="ml-2 text-xs font-normal text-slate-500">
              {credsLoaded ? '서버 동기화됨' : adminSecret ? '미동기화' : '관리자 비밀키 필요'}
            </span>
          </span>
          <span className="text-slate-400 text-sm">{credsOpen ? '−' : '+'}</span>
        </button>
        {credsOpen && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                관리자 비밀키 (ADMIN_SECRET){' '}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminSecret}
                  onChange={(e) => persistSecret(e.target.value)}
                  placeholder="Cloud Functions ADMIN_SECRET 값"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={loadCreds}
                  disabled={!adminSecret || credsLoading}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-100 disabled:opacity-50"
                >
                  {credsLoading ? '확인 중...' : '서버 설정 불러오기'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Cloud Functions의 <code>ADMIN_SECRET</code> env 값과 동일해야 합니다. 이 브라우저에만 저장됩니다.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  뿌리오 계정 (ID)
                </label>
                <input
                  type="text"
                  value={ppurioAccount}
                  onChange={(e) => setPpurioAccount(e.target.value)}
                  placeholder="뿌리오 로그인 아이디"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  API Key{' '}
                  {hasApiKey && (
                    <span className="text-slate-400 font-normal">
                      (현재 저장된: {apiKeyMasked || '···'})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasApiKey
                        ? '변경하려면 새 키 입력 (비우면 유지)'
                        : '뿌리오 발급 API Key'
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900"
                  >
                    {showApiKey ? '숨기기' : '보기'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  발신프로필 (@채널)
                </label>
                <input
                  type="text"
                  value={senderProfile}
                  onChange={(e) => setSenderProfile(e.target.value)}
                  placeholder="예: @kjhedu"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  공통 푸터{' '}
                  <span className="font-normal text-slate-400">(선택)</span>
                </label>
                <input
                  type="text"
                  value={footerLine}
                  onChange={(e) => setFooterLine(e.target.value)}
                  placeholder="예: 수신거부: 0808-xxx-xxxx"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveCreds}
                disabled={credsSaving || !adminSecret}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
              >
                {credsSaving ? '저장 중...' : '서버에 저장'}
              </button>
              {credsNotice && <span className="text-xs text-brand-700">{credsNotice}</span>}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              자격증명은 Firestore <code>settings/ppurio</code>에 저장되며, Firestore rules로
              클라이언트 접근이 차단됩니다. Cloud Functions(Admin SDK)에서만 접근 가능. 뿌리오 IP
              화이트리스트는 컨설팅 레포의 vm-proxy를 그대로 재사용합니다.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">뿌리오 발송 정보</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              발송 유형
            </label>
            <select
              value={msgType}
              onChange={(e) => setMsgType(e.target.value as MsgType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {MSG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              알림톡 템플릿 코드
            </label>
            <input
              type="text"
              value={templateCode}
              onChange={(e) => setTemplateCode(e.target.value)}
              placeholder="예: TPL_20260613_001"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          입력 값은 브라우저에 자동 저장됩니다. 강조표기 제목/보조문구는 뿌리오에 등록된
          템플릿에서 처리되므로 따로 입력하지 않습니다.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-slate-700">
            과제 현황 자동 발송 스케줄
          </p>
          {scheduleNotice && (
            <span className="text-xs text-brand-700">{scheduleNotice}</span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, enabled: e.target.checked }))
            }
            className="accent-brand-600"
          />
          자동 발송 사용
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              주기
            </label>
            <select
              value={schedule.cadence}
              onChange={(e) =>
                setSchedule((s) => ({
                  ...s,
                  cadence: e.target.value as 'daily' | 'weekly',
                }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="weekly">매주</option>
              <option value="daily">매일</option>
            </select>
          </div>
          {schedule.cadence === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                요일
              </label>
              <select
                value={schedule.dayOfWeek}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    dayOfWeek: Number.parseInt(e.target.value, 10),
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <option key={d} value={i}>
                    {d}요일
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              시
            </label>
            <select
              value={schedule.hour}
              onChange={(e) =>
                setSchedule((s) => ({
                  ...s,
                  hour: Number.parseInt(e.target.value, 10),
                }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}시
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              분
            </label>
            <select
              value={schedule.minute}
              onChange={(e) =>
                setSchedule((s) => ({
                  ...s,
                  minute: Number.parseInt(e.target.value, 10),
                }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}분
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={schedule.onlyIncomplete}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, onlyIncomplete: e.target.checked }))
            }
            className="accent-brand-600"
          />
          미완료 과제 있는 학생에게만 발송
        </label>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          저장된 시각에 자동으로 위 템플릿 코드 · 안내사항(아래 [*3*] 칸 값)으로 발송됩니다.
          서버가 KST(Asia/Seoul) 기준으로 5분마다 점검합니다. 동일 시각 중복 발송은 차단됩니다.
        </p>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={scheduleSaving || !adminSecret || !scheduleLoaded}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
          >
            {scheduleSaving ? '저장 중...' : '스케줄 저장'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            안내사항{' '}
            <span className="font-normal text-slate-500">
              (모든 학생에게 동일하게 들어가는 [*3*] 칸)
            </span>
          </label>
          <textarea
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            rows={3}
            placeholder="예) 이번 주말까지 미완료 과제 마무리 부탁드립니다."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-700">테스트 발송</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                테스트 수신번호
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                테스트 이름
              </label>
              <input
                type="text"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="테스트"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={handleTestSend}
              disabled={sending || !testPhone}
              className="rounded-md bg-amber-600 text-white text-sm font-medium px-4 py-2 hover:bg-amber-700 disabled:opacity-50"
            >
              {sending ? '발송 중...' : '테스트 1건 발송'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            첫 학생의 과제 현황을 샘플로 사용. 안내사항은 위 [*2*] 칸 값. 실제 학생 전체
            발송 전에 양식을 점검하세요.
          </p>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="accent-brand-600"
            />
            미완료 과제가 있는 학생만 보기
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={downloadCsv}
              disabled={visible.length === 0}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
            >
              CSV 다운로드 ({visible.length}명)
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={visible.length === 0 || sending}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {sending ? '발송 중...' : `즉시 발송 (${visible.length}명)`}
            </button>
          </div>
        </div>
      </div>

      {sendResults && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">발송 결과</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {sendResults.map((r, i) => (
              <li key={i} className="py-1.5 flex items-center justify-between gap-3">
                <span className="text-slate-700">
                  {r.label || r.phone}{' '}
                  <span className="text-xs text-slate-400">{r.phone}</span>
                </span>
                {r.ok ? (
                  <span className="text-xs text-brand-700 font-medium">성공</span>
                ) : (
                  <span className="text-xs text-red-600">{r.error || '실패'}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          표시할 학생이 없습니다.
        </div>
      )}

      <div className="rounded-lg border border-slate-300 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-slate-900">📈 주간 리포트 알림톡</p>
          {weeklyNotice && (
            <span className="text-xs text-brand-700">{weeklyNotice}</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              템플릿 코드
            </label>
            <input
              type="text"
              value={weekly.templateCode}
              onChange={(e) =>
                setWeekly((w) => ({ ...w, templateCode: e.target.value }))
              }
              placeholder="주간 리포트 템플릿 코드"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              발송 유형
            </label>
            <select
              value={weekly.messageType}
              onChange={(e) =>
                setWeekly((w) => ({ ...w, messageType: e.target.value }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="AT">기본형</option>
              <option value="AI">이미지형</option>
              <option value="ALH">강조표기형</option>
              <option value="ALI">아이템리스트형</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            닫는 멘트 (var4)
          </label>
          <textarea
            value={weekly.closing}
            onChange={(e) =>
              setWeekly((w) => ({ ...w, closing: e.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-700">자동 발송 스케줄 (매주)</p>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={weekly.enabled}
              onChange={(e) =>
                setWeekly((w) => ({ ...w, enabled: e.target.checked }))
              }
              className="accent-brand-600"
            />
            자동 발송 사용
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                요일
              </label>
              <select
                value={weekly.dayOfWeek}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    dayOfWeek: Number.parseInt(e.target.value, 10),
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <option key={d} value={i}>
                    {d}요일
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                시
              </label>
              <select
                value={weekly.hour}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    hour: Number.parseInt(e.target.value, 10),
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}시
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                분
              </label>
              <select
                value={weekly.minute}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    minute: Number.parseInt(e.target.value, 10),
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}분
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveWeekly}
              disabled={weeklySaving || !adminSecret || !scheduleLoaded}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {weeklySaving ? '저장 중...' : '주간 스케줄 저장'}
            </button>
          </div>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-700">테스트 발송 / 즉시 발송</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                테스트 수신번호
              </label>
              <input
                type="tel"
                value={weeklyTestPhone}
                onChange={(e) => setWeeklyTestPhone(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                테스트 이름
              </label>
              <input
                type="text"
                value={weeklyTestName}
                onChange={(e) => setWeeklyTestName(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={handleWeeklyTest}
              disabled={weeklySending || !weeklyTestPhone}
              className="rounded-md bg-amber-600 text-white text-sm font-medium px-4 py-2 hover:bg-amber-700 disabled:opacity-50"
            >
              {weeklySending ? '발송 중...' : '테스트 1건'}
            </button>
          </div>
          <div className="flex justify-end">
            {(() => {
              const recipientCount = bundles.reduce(
                (sum, b) =>
                  sum +
                  ((b.account.phone ?? '').trim() ? 1 : 0) +
                  ((b.account.parentPhone ?? '').trim() ? 1 : 0),
                0,
              )
              return (
                <button
                  type="button"
                  onClick={handleWeeklySendAll}
                  disabled={recipientCount === 0 || weeklySending}
                  className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
                >
                  {weeklySending
                    ? '발송 중...'
                    : `전체 즉시 발송 (학생+학부모 ${recipientCount}건)`}
                </button>
              )
            })()}
          </div>
        </div>

        {weeklySendResults && (
          <ul className="divide-y divide-slate-100 text-sm">
            {weeklySendResults.map((r, i) => (
              <li key={i} className="py-1.5 flex items-center justify-between gap-3">
                <span className="text-slate-700">
                  {r.label || r.phone}{' '}
                  <span className="text-xs text-slate-400">{r.phone}</span>
                </span>
                {r.ok ? (
                  <span className="text-xs text-brand-700 font-medium">성공</span>
                ) : (
                  <span className="text-xs text-red-600">{r.error || '실패'}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {bundles[0] && (
          <details className="rounded-md border border-slate-200 bg-white">
            <summary className="cursor-pointer text-xs font-medium text-slate-700 px-3 py-2 hover:bg-slate-50">
              미리보기 — {bundles[0].account.displayName}
            </summary>
            <div className="px-3 py-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(() => {
                const v = buildWeeklyReportVars(
                  bundles[0].assignments,
                  bundles[0].attempts,
                )
                const enc = new TextEncoder()
                const labelFor = (s: string) => {
                  const len = enc.encode(s).length
                  const over = len > 100
                  return (
                    <span
                      className={`ml-2 text-[10px] font-medium ${over ? 'text-red-600' : 'text-slate-400'}`}
                    >
                      {len}/100 bytes{over ? ' · 초과' : ''}
                    </span>
                  )
                }
                return (
                  <>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        [*1*] 과제 성취도{labelFor(v.var1)}
                      </p>
                      <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                        {v.var1}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        [*2*] 단어 시험 Report{labelFor(v.var2)}
                      </p>
                      <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                        {v.var2}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        [*3*] 문제 풀이 Report{labelFor(v.var3)}
                      </p>
                      <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                        {v.var3}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        [*4*] 닫는 멘트{labelFor(weekly.closing)}
                      </p>
                      <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                        {weekly.closing}
                      </pre>
                    </div>
                  </>
                )
              })()}
            </div>
          </details>
        )}
      </div>

      <ul className="space-y-3">
        {visible.map((b) => {
          const v1 = doneLines(b)
          const v2 = incompleteLines(b)
          const totalCnt = b.assignments.length
          const doneCnt = b.assignments.filter((a) =>
            isAssignmentDone(a, b.attempts),
          ).length
          return (
            <li
              key={b.account.id}
              className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {b.account.displayName}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {b.account.phone || '연락처 없음'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    과제 {doneCnt} / {totalCnt} 완료
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(`${b.account.id}-1`, v1)}
                    className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-2.5 py-1 hover:bg-slate-100"
                  >
                    {copiedId === `${b.account.id}-1` ? '복사됨' : '[*1*] 복사'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(`${b.account.id}-2`, v2)}
                    className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-2.5 py-1 hover:bg-slate-100"
                  >
                    {copiedId === `${b.account.id}-2` ? '복사됨' : '[*2*] 복사'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    [*1*] 완료 과제
                  </p>
                  <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                    {v1}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    [*2*] 미완료 과제
                  </p>
                  <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                    {v2}
                  </pre>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
