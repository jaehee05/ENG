import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { callAuthed } from './authApi'

/** 이 기기의 FCM 토큰. 네이티브가 아니거나 권한이 없으면 null. */
async function currentToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const perm = await FirebaseMessaging.requestPermissions()
    if (perm.receive !== 'granted') return null
    const { token } = await FirebaseMessaging.getToken()
    return token || null
  } catch {
    return null
  }
}

/**
 * 알림을 받을지에 대한 이 기기의 선택.
 *
 * 계정이 아니라 기기에 저장한다 — 끄고 켜는 것이 곧 이 기기의 토큰을 계정에서
 * 떼었다 붙이는 일이라, 폰에서 껐다고 태블릿까지 꺼지면 안 된다.
 */
const PREF_KEY = 'pref_noti'

export function isPushEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== '0'
  } catch {
    return true
  }
}

function setPushPref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0')
  } catch {
    // 저장 못 해도 이번 조작 자체는 아래에서 반영된다
  }
}

/** 이 기기에서 알림을 켠다/끈다. 켜지면 실제로 권한을 받았는지 돌려준다. */
export async function setPushEnabledForUser(on: boolean): Promise<boolean> {
  setPushPref(on)
  if (!on) {
    await unregisterPushTokenForUser()
    return false
  }
  const token = await currentToken()
  if (!token) return false
  try {
    await callAuthed('addFcmToken', { fcmToken: token })
    return true
  } catch (err) {
    console.warn('[push] setPushEnabledForUser 실패:', err)
    return false
  }
}

/** 네이티브에서 알림을 실제로 받을 수 있는 상태인지 (권한까지 확인). */
export async function canReceivePush(): Promise<boolean> {
  return isPushEnabled() && (await currentToken()) !== null
}

/**
 * 네이티브(iOS) 앱에서만: FCM 토큰을 이 계정에 등록하고,
 * 같은 토큰을 갖고 있던 다른 계정에서는 떼어낸다.
 * 권한 거부 / 웹 환경 / 토큰 발급 실패는 조용히 무시.
 *
 * 이 기기에서 알림을 꺼둔 상태면 등록하지 않는다 — 앱을 다시 열 때마다
 * 이 함수가 도는데, 그때 도로 붙어버리면 끈 것이 무의미해진다.
 */
export async function registerPushTokenForUser(): Promise<void> {
  if (!isPushEnabled()) return
  const token = await currentToken()
  if (!token) return
  try {
    // 같은 토큰을 갖고 있던 다른 계정에서 떼어내는 일까지 서버가 한 번에 한다
    // (functions/auth.js 의 addFcmToken). 나눠서 하면 중간에 실패했을 때 이
    // 기기가 어느 계정에도 안 붙어 푸시를 아예 못 받는 상태가 된다.
    await callAuthed('addFcmToken', { fcmToken: token })
  } catch (err) {
    console.warn('[push] registerPushTokenForUser 실패:', err)
  }
}

/**
 * 로그아웃 시 이 기기 토큰을 계정에서 떼어낸다.
 * 이걸 안 하면 기기 주인이 바뀐 뒤에도 이전 사용자의 푸시가 계속 간다.
 */
export async function unregisterPushTokenForUser(): Promise<void> {
  const token = await currentToken()
  if (!token) return
  try {
    await callAuthed('removeFcmToken', { fcmToken: token })
  } catch (err) {
    console.warn('[push] unregisterPushTokenForUser 실패:', err)
  }
}
