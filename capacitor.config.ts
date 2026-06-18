import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kjhedu.app',
  appName: 'KJHEDU',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      // 새 번들 다운로드 즉시 적용 (다음 시작 기다리지 않음)
      directUpdate: true,
    },
  },
}

export default config
