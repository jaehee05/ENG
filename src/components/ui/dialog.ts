/**
 * 앱 안에서 띄우는 확인창·알림창·토스트.
 *
 * window.confirm / window.alert 를 대체한다 — iOS 웹뷰에서 네이티브 창이 뜨면
 * 주소(localhost 등)가 제목으로 찍히고 앱 같지 않다. 호출부를 거의 그대로 두려고
 * 함수 하나로 부른다:
 *
 *   if (!(await confirm('삭제할까요?', { danger: true }))) return
 *
 * 그리는 건 UiHost(App 맨 위)가 한다. 컴포넌트와 파일을 나눈 건 react-refresh
 * 규칙 때문이다(컴포넌트 파일은 컴포넌트만 내보내야 한다).
 */

import { useSyncExternalStore } from 'react'

export interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  /** 지우기처럼 되돌릴 수 없는 일 — 확인 버튼을 빨갛게. */
  danger?: boolean
  /**
   * 확인 버튼을 누른 그 클릭 안에서 바로 실행할 일. 파일 선택 창처럼 iOS 가
   * ‘사용자가 누른 순간’에만 허락하는 동작은 await 뒤로 미루면 조용히 막힌다.
   */
  onConfirm?: () => void
}

export interface DialogRequest extends ConfirmOptions {
  id: number
  kind: 'confirm' | 'alert'
  message: string
  resolve: (ok: boolean) => void
}

export interface ToastRequest {
  id: number
  message: string
  tone: 'default' | 'error'
}

interface State {
  dialogs: DialogRequest[]
  toasts: ToastRequest[]
}

let state: State = { dialogs: [], toasts: [] }
let nextId = 1
let hosts = 0
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

export function useUiState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** UiHost 가 붙어 있는 동안만 앱 안 창을 쓴다. 없으면 브라우저 창으로라도 묻는다. */
export function registerHost(): () => void {
  hosts++
  return () => {
    hosts--
  }
}

export function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (hosts === 0) {
    const ok = window.confirm(message)
    if (ok) opts.onConfirm?.()
    return Promise.resolve(ok)
  }
  return new Promise((resolve) => {
    set({ ...state, dialogs: [...state.dialogs, { ...opts, id: nextId++, kind: 'confirm', message, resolve }] })
  })
}

export function alert(message: string, opts: Pick<ConfirmOptions, 'title' | 'confirmText'> = {}): Promise<void> {
  if (hosts === 0) {
    window.alert(message)
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    set({
      ...state,
      dialogs: [...state.dialogs, { ...opts, id: nextId++, kind: 'alert', message, resolve: () => resolve() }],
    })
  })
}

export function closeDialog(id: number, ok: boolean) {
  const d = state.dialogs.find((x) => x.id === id)
  if (!d) return
  set({ ...state, dialogs: state.dialogs.filter((x) => x.id !== id) })
  d.resolve(ok)
}

/** 잠깐 떴다 사라지는 안내. 답을 기다릴 필요 없는 알림(window.alert 중 대부분)용. */
export function toast(message: string, opts: { tone?: 'default' | 'error'; duration?: number } = {}) {
  const id = nextId++
  set({ ...state, toasts: [...state.toasts, { id, message, tone: opts.tone ?? 'default' }] })
  window.setTimeout(() => {
    set({ ...state, toasts: state.toasts.filter((t) => t.id !== id) })
  }, opts.duration ?? 2600)
}
