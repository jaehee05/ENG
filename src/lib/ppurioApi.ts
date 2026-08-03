import { callAuthed } from './authApi'
// Cloud Run 2세대 함수의 직접 URL. VITE_PPURIO_ADMIN_URL이 지정되면 그것을 우선.
const DEFAULT_URL = 'https://ppurioadmin-cfq2cexd2a-du.a.run.app'
const ENDPOINT_URL =
  import.meta.env.VITE_PPURIO_ADMIN_URL ?? DEFAULT_URL
const SS_SECRET = 'eng_admin_secret_session'
const LEGACY_LS_SECRET = 'eng_admin_secret'

export interface ManualDefaults {
  templateCode: string
  messageType: string
  notice: string
}

export interface PpurioSettingsView {
  ppurioAccount: string
  senderProfile: string
  apiKeyMasked: string
  hasApiKey: boolean
  footer: string
  manualDefaults: ManualDefaults
}

export interface PpurioSettingsInput {
  ppurioAccount: string
  senderProfile: string
  apiKey?: string
  footer: string
  manualDefaults?: ManualDefaults
}

export interface SendRecipient {
  label?: string
  phone: string
  name?: string
  changeWord: Record<string, string>
}

export interface SendResultItem {
  label?: string
  phone: string
  ok: boolean
  error?: string
}

export interface BootstrapResult {
  adminSecret: string
  manualDefaults: ManualDefaults
}

let memSecret: string | null = null

export function getAdminSecret(): string {
  if (memSecret) return memSecret
  const fromSession = sessionStorage.getItem(SS_SECRET)
  if (fromSession) {
    memSecret = fromSession
    return fromSession
  }
  // 마이그레이션: 기존 localStorage 값을 sessionStorage로 옮긴 뒤 제거.
  const legacy = localStorage.getItem(LEGACY_LS_SECRET)
  if (legacy) {
    sessionStorage.setItem(SS_SECRET, legacy)
    localStorage.removeItem(LEGACY_LS_SECRET)
    memSecret = legacy
    return legacy
  }
  return ''
}

export function setAdminSecret(s: string): void {
  memSecret = s || null
  if (s) sessionStorage.setItem(SS_SECRET, s)
  else sessionStorage.removeItem(SS_SECRET)
}

/**
 * adminSecret + manualDefaults 를 DB 에서 받아온다.
 *
 * 예전에는 uid + 평문 비밀번호로 인증했다. 비밀번호가 해시로 바뀌어 클라이언트가
 * 평문을 들고 있을 수 없게 되면서, 이미 로그인한 세션을 근거로 받아온다.
 */
export async function bootstrapAdmin(): Promise<BootstrapResult> {
  return callAuthed<BootstrapResult>('adminBootstrap')
}

async function call<T>(action: string, payload?: unknown): Promise<T> {
  const secret = getAdminSecret()
  if (!secret) throw new Error('관리자 비밀키가 설정되지 않았습니다.')
  const res = await fetch(ENDPOINT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-secret': secret,
    },
    body: JSON.stringify({ action, payload }),
  })
  if (!res.ok) {
    let msg = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

/** 현재 secret을 DB(settings/notifyConfig)에 저장. 이후 다른 기기에서 bootstrap로 받아올 수 있음. */
export async function persistAdminSecretToDb(): Promise<void> {
  await call<{ ok: true }>('setAdminSecret', { adminSecret: getAdminSecret() })
}

export async function saveManualDefaults(input: ManualDefaults): Promise<void> {
  await call<{ ok: true }>('saveManualDefaults', input)
}

export async function fetchPpurioSettings(): Promise<PpurioSettingsView> {
  return call<PpurioSettingsView>('get')
}

export async function savePpurioSettings(input: PpurioSettingsInput): Promise<void> {
  await call<{ ok: true }>('save', input)
}

export async function sendBatchAlimtalk(input: {
  templateCode: string
  messageType: string
  recipients: SendRecipient[]
}): Promise<{ sent: number; failed: number; results: SendResultItem[] }> {
  return call('sendBatch', input)
}

export type Cadence = 'daily' | 'weekly'

export interface AssignmentStatusSchedule {
  enabled: boolean
  cadence: Cadence
  /** Sunday=0, Saturday=6. weekly만 사용. */
  dayOfWeek: number
  hour: number
  minute: number
  templateCode: string
  messageType: string
  notice: string
  /** true면 미완료 과제가 있는 학생에게만 발송. */
  onlyIncomplete: boolean
  lastSentKey?: string
}

export interface WeeklyReportSchedule {
  enabled: boolean
  /** Sunday=0, Saturday=6. */
  dayOfWeek: number
  hour: number
  minute: number
  templateCode: string
  messageType: string
  /** var4 — 마지막 격려 멘트. */
  closing: string
  lastSentKey?: string
}

export interface ScheduleSettings {
  assignmentStatus: AssignmentStatusSchedule
  weeklyReport: WeeklyReportSchedule
}

export const DEFAULT_ASSIGNMENT_STATUS_SCHEDULE: AssignmentStatusSchedule = {
  enabled: false,
  cadence: 'weekly',
  dayOfWeek: 0,
  hour: 9,
  minute: 0,
  templateCode: '',
  messageType: 'ALH',
  notice: '',
  onlyIncomplete: false,
}

export const DEFAULT_WEEKLY_REPORT_SCHEDULE: WeeklyReportSchedule = {
  enabled: false,
  dayOfWeek: 1, // 월요일
  hour: 9,
  minute: 0,
  templateCode: '',
  messageType: 'ALH',
  closing:
    '이번 주에도 목표를 달성할 수 있도록 가정에서도 많은 칭찬과 격려 부탁드립니다!',
}

export async function fetchScheduleSettings(): Promise<ScheduleSettings> {
  return call<ScheduleSettings>('getSchedule')
}

export async function saveScheduleSettings(
  input: Partial<ScheduleSettings>,
): Promise<void> {
  await call<{ ok: true }>('saveSchedule', input)
}

export interface PushSendResult {
  ok: true
  sent: number
  failed: number
  invalid: number
  errors?: { code: string; message: string }[]
}

export async function purgeAllNotifications(): Promise<{
  ok: true
  deleted: number
}> {
  return call('purgeNotifications')
}

export interface ManualSendResult {
  ok: true
  sent: number
  failed: number
  results: SendResultItem[]
}

/** 특정 학생 1명에게 주간 리포트 즉시 발송 (학생/학부모 둘 다 번호 있으면 둘 다). */
export async function sendWeeklyReportNow(
  studentUid: string,
): Promise<ManualSendResult> {
  return call<ManualSendResult>('sendWeeklyReportNow', { studentUid })
}

/** 특정 학생 1명에게 과제 현황 알림톡 즉시 발송. notice 비우면 스케줄 기본값 사용. */
export async function sendAssignmentStatusNow(
  studentUid: string,
  notice?: string,
): Promise<ManualSendResult> {
  return call<ManualSendResult>('sendAssignmentStatusNow', {
    studentUid,
    notice,
  })
}

export async function sendPushNotification(input: {
  uids?: string[]
  all?: boolean
  title: string
  body: string
  link?: string
  data?: Record<string, string>
}): Promise<PushSendResult> {
  const data = { ...(input.data || {}) }
  if (input.link) data.link = input.link
  return call<PushSendResult>('sendPush', {
    uids: input.uids,
    all: input.all,
    title: input.title,
    body: input.body,
    data,
  })
}
