import { useEffect, useMemo, useState } from 'react'
import { listAccounts } from '../lib/account'
import {
  isAssignmentDone,
  listAssignmentsForStudent,
  listAttemptsForUser,
} from '../lib/firestore'
import {
  fetchPpurioSettings,
  getAdminSecret,
  savePpurioSettings,
  sendBatchAlimtalk,
  setAdminSecret,
  type PpurioSettingsView,
  type SendResultItem,
} from '../lib/ppurioApi'
import type { Assignment, Attempt, UserAccount } from '../lib/types'

interface StudentBundle {
  account: UserAccount
  assignments: Assignment[]
  attempts: Attempt[]
}

function statusLines(b: StudentBundle): string[] {
  return b.assignments.map((a) => {
    const done = isAssignmentDone(a, b.attempts)
    return `▶ ${a.refTitle} - ${done ? '완료' : '미완료'}`
  })
}

function statusValue(b: StudentBundle): string {
  const lines = statusLines(b)
  return lines.length > 0 ? lines.join('\n') : '(부여된 과제가 없습니다)'
}

const TEMPLATE_PREVIEW = `2027 재희T 1:1 개인 과외
과제 현황 안내
[*이름*]님, 과제 현황 안내입니다.

[*1*]

[*2*]`

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
      const sampleStatus = bundles[0]
        ? statusValue(bundles[0])
        : '▶ 샘플 단어 시험 DAY 1 - 미완료\n▶ 샘플 지문 문제풀이 - 완료'
      const out = await sendBatchAlimtalk({
        templateCode: templateCode.trim(),
        messageType: MSG_TYPE_CODE[msgType],
        recipients: [
          {
            label: '테스트',
            phone,
            name: '테스트',
            changeWord: {
              '#{이름}': testName.trim() || '테스트',
              '#{1}': sampleStatus,
              '#{2}': notice || '(안내사항 미입력)',
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
          '#{이름}': b.account.displayName,
          '#{1}': statusValue(b),
          '#{2}': notice,
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
    const rows = [['발송유형', '템플릿코드', '수신번호', '이름', '1', '2']]
    for (const b of visible) {
      rows.push([
        msgType,
        templateCode,
        b.account.phone ?? '',
        b.account.displayName,
        statusValue(b),
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

      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            안내사항{' '}
            <span className="font-normal text-slate-500">
              (모든 학생에게 동일하게 들어가는 [*2*] 칸)
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

      <ul className="space-y-3">
        {visible.map((b) => {
          const v1 = statusValue(b)
          const totalCnt = b.assignments.length
          const doneCnt = b.assignments.filter((a) =>
            isAssignmentDone(a, b.attempts),
          ).length
          return (
            <li
              key={b.account.id}
              className="rounded-lg border border-slate-200 bg-white p-4 space-y-2"
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
                <button
                  type="button"
                  onClick={() => copyText(b.account.id, v1)}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-100"
                >
                  {copiedId === b.account.id ? '복사됨!' : '[*1*] 복사'}
                </button>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                [*1*] 변수 값
              </p>
              <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                {v1}
              </pre>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
