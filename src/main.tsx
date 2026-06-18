import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import './index.css'
import App from './App.tsx'

// 네이티브 앱(iOS Capacitor)에서만 적용되는 CSS hook
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app')
  // Capgo Live Update: 새 번들이 정상 부팅됐음을 알림 → commit, 실패 시 자동 rollback
  void CapacitorUpdater.notifyAppReady().catch(() => {
    // 첫 설치엔 normal — 무시
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
