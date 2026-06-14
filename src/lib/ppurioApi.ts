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
