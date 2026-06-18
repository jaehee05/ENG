import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'

// 네이티브 앱(iOS Capacitor)에서만 적용되는 CSS hook
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app')
}

// Capgo Live Update notifyAppReady는 Capgo 계정/토큰 셋업 후 활성화 예정

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
