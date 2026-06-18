import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import './index.css'
import App from './App.tsx'

// Capgo Live Update: 새 번들이 정상 로드되었음을 알려 commit (실패 시 자동 rollback)
if (Capacitor.isNativePlatform()) {
  void CapacitorUpdater.notifyAppReady().catch(() => {
    // 첫 설치/웹 환경에서는 에러 무시
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
