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
 * 네이티브(iOS) 앱에서만: FCM 토큰을 이 계정에 등록하고,
 * 같은 토큰을 갖고 있던 다른 계정에서는 떼어낸다.
 * 권한 거부 / 웹 환경 / 토큰 발급 실패는 조용히 무시.
 */
export async function registerPushTokenForUser(): Promise<void> {
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
