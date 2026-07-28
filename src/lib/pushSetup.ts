import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

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
 * 이 토큰을 들고 있는 다른 계정에서 토큰을 떼어낸다.
 *
 * 기기 하나의 FCM 토큰은 그 기기에 지금 로그인한 사람 것이어야 한다.
 * 예전에는 로그인할 때 arrayUnion 으로 더하기만 하고 로그아웃 때 지우지
 * 않아서, 한 기기를 여러 계정으로 쓰면(형제, 기기 물려주기, 관리자가
 * 학생 계정으로 확인) 같은 토큰이 여러 users 문서에 남았다.
 * 그 상태에서 A 에게 과제를 부여하면 A 의 토큰 목록에 있는 그 기기 —
 * 지금은 B 가 쓰는 기기 — 로도 푸시가 갔다.
 */
async function releaseTokenFromOthers(token: string, keepUid: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('fcmTokens', 'array-contains', token)),
  )
  await Promise.all(
    snap.docs
      .filter((d) => d.id !== keepUid)
      .map((d) =>
        updateDoc(d.ref, { fcmTokens: arrayRemove(token) }).catch(() => {}),
      ),
  )
}

/**
 * 네이티브(iOS) 앱에서만: FCM 토큰을 이 계정에 등록하고,
 * 같은 토큰을 갖고 있던 다른 계정에서는 떼어낸다.
 * 권한 거부 / 웹 환경 / 토큰 발급 실패는 조용히 무시.
 */
export async function registerPushTokenForUser(uid: string): Promise<void> {
  const token = await currentToken()
  if (!token) return
  try {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) })
    // 등록을 먼저 하고 회수한다. 순서가 반대면 중간에 실패했을 때
    // 이 기기가 어느 계정에도 안 붙어 푸시를 아예 못 받는 상태가 된다.
    await releaseTokenFromOthers(token, uid)
  } catch (err) {
    console.warn('[push] registerPushTokenForUser 실패:', err)
  }
}

/**
 * 로그아웃 시 이 기기 토큰을 계정에서 떼어낸다.
 * 이걸 안 하면 기기 주인이 바뀐 뒤에도 이전 사용자의 푸시가 계속 간다.
 */
export async function unregisterPushTokenForUser(uid: string): Promise<void> {
  const token = await currentToken()
  if (!token) return
  try {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) })
  } catch (err) {
    console.warn('[push] unregisterPushTokenForUser 실패:', err)
  }
}
