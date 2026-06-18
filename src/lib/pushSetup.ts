import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 네이티브(iOS) 앱에서만: FCM 토큰을 요청해 firestore users/{uid}.fcmTokens에 추가.
 * 권한 거부 / 웹 환경 / 토큰 발급 실패는 조용히 무시.
 */
export async function registerPushTokenForUser(uid: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const perm = await FirebaseMessaging.requestPermissions()
    if (perm.receive !== 'granted') return
    const { token } = await FirebaseMessaging.getToken()
    if (!token) return
    await updateDoc(doc(db, 'users', uid), {
      fcmTokens: arrayUnion(token),
    })
  } catch (err) {
    console.warn('[push] registerPushTokenForUser 실패:', err)
  }
}
