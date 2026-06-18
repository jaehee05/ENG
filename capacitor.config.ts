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
      // Capgo 기본 채널: production
      autoUpdate: true,
      // 첫 실행 시 번들 검증 후 commit (실패하면 이전 번들로 rollback)
      directUpdate: false,
    },
  },
}

export default config
