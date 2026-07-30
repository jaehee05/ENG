import { useEffect } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

interface ScreenGuardPlugin {
  /** 스크린샷·녹화에 화면이 검게 나오게 한다. applied=false 면 이 기기에선 안 통한 것. */
  enable(): Promise<{ applied: boolean; reason?: string }>
  disable(): Promise<void>
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard')

/**
 * 화면이 떠 있는 동안 스크린샷 보호를 켜고, 나갈 때 끈다.
 *
 * iOS 앱에서만 동작한다. 웹(관리자 브라우저 등)에는 이런 수단이 없어서 조용히
 * 넘어간다 — 시험 화면이 웹에서 안 열리는 것은 아니므로 막지는 않는다.
 *
 * 실패해도 삼킨다. 보호가 안 걸렸다고 시험을 못 보게 할 수는 없다.
 */
export function useScreenGuard(active = true): void {
  useEffect(() => {
    if (!active || !Capacitor.isNativePlatform()) return
    // 네이티브 플러그인이 없는 옛 빌드에 이 화면이 OTA 로 먼저 내려갈 수 있다.
    // 그때 Capacitor 는 "not implemented" 로 튕기는데, 동기로 던지는 경우까지
    // 감싸 둔다 — 시험이 안 열리는 것보다 보호가 안 걸리는 편이 낫다.
    const call = (fn: () => Promise<unknown>) => {
      try {
        void fn().catch(() => {})
      } catch {
        // 무시
      }
    }
    call(() => ScreenGuard.enable())
    return () => {
      call(() => ScreenGuard.disable())
    }
  }, [active])
}
