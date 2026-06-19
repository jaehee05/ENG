// Cloud Run 2세대 함수의 직접 URL. VITE_PPURIO_ADMIN_URL이 지정되면 그것을 우선.
const DEFAULT_URL = 'https://ppurioadmin-cfq2cexd2a-du.a.run.app'
const ENDPOINT_URL =
  import.meta.env.VITE_PPURIO_ADMIN_URL ?? DEFAULT_URL
const LS_SECRET = 'eng_admin_secret'

export interface PpurioSettingsView {
  ppurioAccount: string
  senderProfile: string
  apiKeyMasked: string
  hasApiKey: boolean
  footer: string
}

export interface PpurioSettingsInput {
  ppurioAccount: string
  senderProfile: string
  apiKey?: string
  footer: string
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

export function getAdminSecret(): string {
  return localStorage.getItem(LS_SECRET) ?? ''
}

export function setAdminSecret(s: string): void {
  if (s) localStorage.setItem(LS_SECRET, s)
  else localStorage.removeItem(LS_SECRET)
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

export async function sendPushNotification(input: {
  uids?: string[]
  all?: boolean
  title: string
  body: string
  data?: Record<string, string>
}): Promise<PushSendResult> {
  return call<PushSendResult>('sendPush', input)
}

export interface AuthDiagResult {
  ok: boolean
  projectId?: string | null
  hasCred?: boolean
  hasToken?: boolean
  tokenStart?: string | null
  expiresIn?: number | null
  tokenError?: string
  dryRun?: string
  dryRunCode?: string | null
  dryRunMessage?: string
  error?: string
}

export async function diagAuth(): Promise<AuthDiagResult> {
  return call<AuthDiagResult>('diagAuth')
}
