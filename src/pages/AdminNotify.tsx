import { useEffect, useMemo, useState } from 'react'
import { listAccounts } from '../lib/account'
import {
  cleanupDuplicatePushTokens,
  createPushSchedule,
  deletePushSchedule,
  isAssignmentDone,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listPushSchedules,
  updatePushSchedule,
} from '../lib/firestore'
import type { PushSchedule } from '../lib/types'
import {
  DEFAULT_ASSIGNMENT_STATUS_SCHEDULE,
  DEFAULT_WEEKLY_REPORT_SCHEDULE,
  fetchPpurioSettings,
  fetchScheduleSettings,
  getAdminSecret,
  persistAdminSecretToDb,
  savePpurioSettings,
  saveManualDefaults,
  saveScheduleSettings,
  sendBatchAlimtalk,
  sendPushNotification,
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
    const head = items.slice(0, n - 1)
    const last = `${items[n - 1]} 외 ${items.length - n}개`
    const text = [...head, last].join('\n')
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

type MsgType = '기본형' | '이미지형' | '강조표기형' | '아이템리스트형'

const MSG_TYPES: MsgType[] = ['기본형', '이미지형', '강조표기형', '아이템리스트형']

const MSG_TYPE_CODE: Record<MsgType, string> = {
  기본형: 'AT',
  이미지형: 'AI',
  강조표기형: 'ALH',
  아이템리스트형: 'ALI',
}

const MSG_TYPE_FROM_CODE: Record<string, MsgType> = {
  AT: '기본형',
  AI: '이미지형',
  ALH: '강조표기형',
  ALI: '아이템리스트형',
}

export function AdminNotify() {
  const [bundles, setBundles] = useState<StudentBundle[]>([])
  const [templateCode, setTemplateCode] = useState('')
  const [msgType, setMsgType] = useState<MsgType>('강조표기형')
  const [notice, setNotice] = useState('')
  const [manualDefaultsLoaded, setManualDefaultsLoaded] = useState(false)
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

  const [schedules, setSchedules] = useState<PushSchedule[]>([])
  const [schedTitle, setSchedTitle] = useState('')
  const [schedBody, setSchedBody] = useState('')
  const [schedCadence, setSchedCadence] = useState<'daily' | 'weekly'>('daily')
  const [schedDow, setSchedDow] = useState(1)
  const [schedHour, setSchedHour] = useState(8)
  const [schedMinute, setSchedMinute] = useState(0)
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedNote, setSchedNote] = useState<string | null>(null)
  const [schedEditId, setSchedEditId] = useState<string | null>(null)

  async function loadSchedules() {
    try {
      setSchedules(await listPushSchedules())
    } catch {
      // 무시
    }
  }

  useEffect(() => {
    void loadSchedules()
  }, [])

  async function handleSavePushSchedule() {
    if (!schedTitle.trim()) {
      setSchedNote('제목을 입력하세요.')
      return
    }
    setSchedSaving(true)
    setSchedNote(null)
    try {
      const payload = {
        title: schedTitle,
        body: schedBody,
        enabled: true,
        cadence: schedCadence,
        dayOfWeek: schedCadence === 'weekly' ? schedDow : undefined,
        hour: schedHour,
        minute: schedMinute,
      }
      if (schedEditId) {
        await updatePushSchedule(schedEditId, payload)
      } else {
        await createPushSchedule(payload)
      }
      setSchedTitle('')
      setSchedBody('')
      setSchedEditId(null)
      setSchedNote(schedEditId ? '수정 완료' : '추가 완료')
      await loadSchedules()
    } catch (e) {
      setSchedNote(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSchedSaving(false)
    }
  }

  async function handleToggleSchedule(s: PushSchedule) {
    try {
      await updatePushSchedule(s.id, { enabled: !s.enabled })
      await loadSchedules()
    } catch (e) {
      setSchedNote(e instanceof Error ? e.message : '상태 변경 실패')
    }
  }

  async function handleDeleteSchedule(s: PushSchedule) {
    if (!window.confirm(`"${s.title}" 정기 푸시를 삭제할까요?`)) return
    try {
      await deletePushSchedule(s.id)
      await loadSchedules()
    } catch (e) {
      setSchedNote(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  function startEditSchedule(s: PushSchedule) {
    setSchedEditId(s.id)
    setSchedTitle(s.title)
    setSchedBody(s.body)
    setSchedCadence(s.cadence)
    setSchedDow(s.dayOfWeek ?? 1)
    setSchedHour(s.hour)
    setSchedMinute(s.minute)
  }

  const [pushTitle, setPushTitle] = useState('')
  const [pushBody, setPushBody] = useState('')
  const [pushSending, setPushSending] = useState(false)
  const [tokenCleanBusy, setTokenCleanBusy] = useState(false)
  const [tokenCleanNote, setTokenCleanNote] = useState<string | null>(null)
  const [pushNote, setPushNote] = useState<string | null>(null)
  const [pushSelected, setPushSelected] = useState<Set<string>>(new Set())
  const [pushAll, setPushAll] = useState(true)


  async function handleSendPush() {
    if (!adminSecret) {
      setPushNote('관리자 비밀키를 먼저 입력하세요.')
      return
    }
    if (!pushTitle.trim() && !pushBody.trim()) {
      setPushNote('제목 또는 본문을 입력하세요.')
      return
    }
    if (!pushAll && pushSelected.size === 0) {
      setPushNote('대상 학생을 선택하세요.')
      return
    }
    const targetCount = pushAll ? bundles.length : pushSelected.size
    if (
      !window.confirm(
        `${pushAll ? '전체 활성 학생' : `${targetCount}명`}에게 푸시 알림을 발송합니다. 계속할까요?`,
      )
    )
      return
    setPushSending(true)
    setPushNote(null)
    try {
      const result = await sendPushNotification({
        all: pushAll,
        uids: pushAll ? undefined : Array.from(pushSelected),
        title: pushTitle.trim(),
        body: pushBody.trim(),
      })
      const errPart =
        result.errors && result.errors.length > 0
          ? ` · 에러: ${result.errors
              .map((e) => `${e.code}${e.message ? ` (${e.message})` : ''}`)
              .join(' / ')}`
          : ''
      setPushNote(
        `발송 완료: 성공 ${result.sent} · 실패 ${result.failed} · 만료 토큰 정리 ${result.invalid}${errPart}`,
      )
    } catch (e) {
      setPushNote(e instanceof Error ? e.message : '푸시 발송 실패')
    } finally {
      setPushSending(false)
    }
  }

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
    const md = v.manualDefaults
    const hasDbValues = !!(md && (md.templateCode || md.notice))
    if (hasDbValues) {
      setTemplateCode(md.templateCode || '')
      setNotice(md.notice || '')
      const mt = MSG_TYPE_FROM_CODE[md.messageType || 'ALH']
      if (mt) setMsgType(mt)
    } else {
      // 레거시 localStorage 값이 있으면 채워두고, 디바운스 저장 effect가 DB로 옮긴 뒤 정리.
      const legacyTC = localStorage.getItem('eng_notify_template_code')
      const legacyMT = localStorage.getItem('eng_notify_msg_type') as MsgType | null
      const legacyN = localStorage.getItem('eng_notify_notice')
      if (legacyTC) setTemplateCode(legacyTC)
      if (legacyMT && MSG_TYPES.includes(legacyMT)) setMsgType(legacyMT)
      if (legacyN) setNotice(legacyN)
      localStorage.removeItem('eng_notify_template_code')
      localStorage.removeItem('eng_notify_msg_type')
      localStorage.removeItem('eng_notify_notice')
    }
    setManualDefaultsLoaded(true)
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

  // 사용자가 templateCode/msgType/notice를 바꾸면 디바운스 후 DB에 저장.
  useEffect(() => {
    if (!manualDefaultsLoaded || !adminSecret) return
    const t = setTimeout(() => {
      void saveManualDefaults({
        templateCode,
        messageType: MSG_TYPE_CODE[msgType],
        notice,
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [manualDefaultsLoaded, adminSecret, templateCode, msgType, notice])

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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리자
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">알림톡 발송 도우미</h1>
        <p className="text-sm text-slate-500 mt-1">
          학생별 과제 현황을 자동으로 채워 뿌리오 알림톡 변수 CSV를 만듭니다. 다운로드 받아
          뿌리오 대량발송에 그대로 업로드하세요.
        </p>
      </div>

      <div className="rounded-lg border border-slate-300 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-slate-900">
            📲 푸시 알림 (KJHEDU 앱 설치 학생)
          </p>
          {pushNote && (
            <span className="text-xs text-brand-700">{pushNote}</span>
          )}
        </div>
        <input
          type="text"
          value={pushTitle}
          onChange={(e) => setPushTitle(e.target.value)}
          placeholder="제목 (예: 새 과제가 부여되었습니다)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <textarea
          value={pushBody}
          onChange={(e) => setPushBody(e.target.value)}
          rows={2}
          placeholder="본문 (예: DAY 1 단어시험을 풀어주세요)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={pushAll}
            onChange={(e) => setPushAll(e.target.checked)}
            className="accent-brand-600"
          />
          전체 활성 학생에게 발송
        </label>
        {!pushAll && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-sm">
              {bundles.map((b) => {
                const checked = pushSelected.has(b.account.id)
                return (
                  <label
                    key={b.account.id}
                    className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-white"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setPushSelected((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(b.account.id)
                          else next.delete(b.account.id)
                          return next
                        })
                      }
                      className="accent-brand-600"
                    />
                    <span className="truncate">{b.account.displayName}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSendPush}
            disabled={pushSending}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
          >
            {pushSending
              ? '발송 중...'
              : `푸시 발송 ${pushAll ? `(전체 ${bundles.length}명)` : `(${pushSelected.size}명)`}`}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          학생이 iOS 앱에서 로그인 + 푸시 권한 허용한 경우만 발송됩니다 (firestore의 fcmTokens가 있는 학생). 알림톡과 별도.
        </p>

        {/* 한 기기를 여러 계정으로 쓴 흔적 정리. 예전에는 로그아웃 시 토큰을
            떼어내지 않아 같은 토큰이 여러 계정에 남았고, 그래서 남의 푸시가
            갔다. 지금은 로그인·로그아웃에서 자동 정리되지만 이미 쌓인 건
            이 버튼으로 한 번 털어낸다. */}
        <div className="border-t border-slate-200 pt-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700">중복 기기 정리</p>
            <p className="text-[11px] text-slate-500">
              한 기기가 여러 계정에 등록돼 있으면 남의 푸시까지 갑니다. 중복된
              등록을 모두 해제합니다 — 해당 기기는 앱을 한 번 열면 지금 로그인한
              계정으로 다시 등록됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (
                !window.confirm(
                  '여러 계정에 중복 등록된 기기의 푸시 등록을 모두 해제할까요?\n해당 기기는 앱을 한 번 열면 자동으로 다시 등록됩니다.',
                )
              )
                return
              setTokenCleanBusy(true)
              setTokenCleanNote(null)
              try {
                const r = await cleanupDuplicatePushTokens()
                setTokenCleanNote(
                  r.tokens === 0
                    ? '중복 등록된 기기가 없습니다.'
                    : `기기 ${r.tokens}대 · 계정 ${r.accounts}개에서 중복 등록을 해제했습니다.`,
                )
              } catch (e) {
                setTokenCleanNote(e instanceof Error ? e.message : '정리 실패')
              } finally {
                setTokenCleanBusy(false)
              }
            }}
            disabled={tokenCleanBusy}
            className="shrink-0 rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 touch:py-2 hover:bg-slate-100 disabled:opacity-50"
          >
            {tokenCleanBusy ? '정리 중…' : '중복 정리'}
          </button>
        </div>
        {tokenCleanNote && (
          <p className="text-[11px] text-brand-700">{tokenCleanNote}</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-300 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-slate-900">
            ⏰ 정기 푸시 알림
          </p>
          {schedNote && (
            <span className="text-xs text-brand-700">{schedNote}</span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          매일/매주 정해진 시간에 모든 활성 학생에게 자동 푸시. 수업 시간/장소 안내 등에 활용.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={schedTitle}
            onChange={(e) => setSchedTitle(e.target.value)}
            placeholder="제목 (예: 오늘 수업)"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="text"
            value={schedBody}
            onChange={(e) => setSchedBody(e.target.value)}
            placeholder="본문 (예: 18시 학원 2층)"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select
            value={schedCadence}
            onChange={(e) =>
              setSchedCadence(e.target.value as 'daily' | 'weekly')
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="daily">매일</option>
            <option value="weekly">매주</option>
          </select>
          {schedCadence === 'weekly' ? (
            <select
              value={schedDow}
              onChange={(e) =>
                setSchedDow(Number.parseInt(e.target.value, 10))
              }
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <option key={d} value={i}>
                  {d}요일
                </option>
              ))}
            </select>
          ) : (
            <div />
          )}
          <select
            value={schedHour}
            onChange={(e) =>
              setSchedHour(Number.parseInt(e.target.value, 10))
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}시
              </option>
            ))}
          </select>
          <select
            value={schedMinute}
            onChange={(e) =>
              setSchedMinute(Number.parseInt(e.target.value, 10))
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}분
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2">
          {schedEditId && (
            <button
              type="button"
              onClick={() => {
                setSchedEditId(null)
                setSchedTitle('')
                setSchedBody('')
              }}
              className="text-xs text-slate-500 hover:text-slate-900 underline"
            >
              취소
            </button>
          )}
          <button
            type="button"
            onClick={handleSavePushSchedule}
            disabled={schedSaving}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {schedSaving ? '저장 중…' : schedEditId ? '수정 저장' : '추가'}
          </button>
        </div>

        {schedules.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {schedules.map((s) => (
              <li
                key={s.id}
                className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {s.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {s.cadence === 'weekly'
                      ? `매주 ${['일', '월', '화', '수', '목', '금', '토'][s.dayOfWeek ?? 1]}요일`
                      : '매일'}{' '}
                    {String(s.hour).padStart(2, '0')}:
                    {String(s.minute).padStart(2, '0')}
                    {s.body && ` · ${s.body}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleSchedule(s)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.enabled
                        ? 'bg-brand-50 text-brand-700 border border-brand-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {s.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditSchedule(s)}
                    className="text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSchedule(s)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  value={adminSecret}
                  onChange={(e) => persistSecret(e.target.value)}
                  placeholder="자동 bootstrap 되지 않으면 직접 입력"
                  className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={loadCreds}
                  disabled={!adminSecret || credsLoading}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-100 disabled:opacity-50"
                >
                  {credsLoading ? '확인 중...' : '서버 설정 불러오기'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setCredsNotice(null)
                    try {
                      await persistAdminSecretToDb()
                      setCredsNotice('DB에 시크릿 저장됨 — 다른 기기에서도 자동 로드됩니다.')
                    } catch (e) {
                      setCredsNotice(e instanceof Error ? e.message : '저장 실패')
                    }
                  }}
                  disabled={!adminSecret}
                  className="rounded-md border border-brand-300 bg-brand-50 text-brand-700 text-sm font-medium px-3 py-2 hover:bg-brand-100 disabled:opacity-50"
                >
                  DB에 시크릿 저장
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                로그인 시 자동 bootstrap. 처음 설정 시엔 ADMIN_SECRET env 값을 직접 입력 후 [DB에 시크릿 저장]을 누르면, 그 이후엔 다른 기기에서도 자동으로 받아옵니다.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              템플릿 코드 (자동 발송용)
            </label>
            <input
              type="text"
              value={schedule.templateCode}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, templateCode: e.target.value }))
              }
              placeholder="과제 현황 템플릿 코드"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              발송 유형
            </label>
            <select
              value={schedule.messageType}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, messageType: e.target.value }))
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
            안내사항 (자동 발송 시 [*3*] 칸)
          </label>
          <textarea
            value={schedule.notice}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, notice: e.target.value }))
            }
            rows={2}
            placeholder="예) 이번 주말까지 미완료 과제 마무리 부탁드립니다."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
