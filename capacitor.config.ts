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
      // Capgo 계정 셋업 전: 자동 업데이트 비활성
      autoUpdate: false,
    },
  },
}

export default config
