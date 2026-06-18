import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kjhedu.app',
  appName: 'KJHEDU',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      directUpdate: false,
    },
  },
}

export default config
