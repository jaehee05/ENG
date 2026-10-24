import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zipSync } from 'fflate'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
/** 이 번들을 만든 시각. 앱 안(__BUILT_AT__)과 ota/latest.json 에 같은 값이 들어간다. */
const BUILT_AT = Date.now()

/**
 * Capgo 를 거치지 않는 예비 업데이트 통로(src/lib/otaFallback.ts)용 파일.
 * Vercel 빌드에서만 만든다 — Capgo 로 올리는 번들 안에 zip 이 또 들어가면 크기가 두 배가 된다.
 * dist/ota/bundle-<시각>.zip 과 그 위치를 적은 dist/ota/latest.json.
 */
function otaBundle(): Plugin {
  return {
    name: 'ota-bundle',
    apply: 'build',
    closeBundle() {
      if (!process.env.VERCEL) return
      const dist = new URL('./dist', import.meta.url).pathname
      const files: Record<string, Uint8Array> = {}
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else files[relative(dist, p)] = readFileSync(p)
        }
      }
      walk(dist)
      mkdirSync(join(dist, 'ota'), { recursive: true })
      const zipName = `bundle-${BUILT_AT}.zip`
      writeFileSync(join(dist, 'ota', zipName), zipSync(files, { level: 9 }))
      writeFileSync(
        join(dist, 'ota', 'latest.json'),
        JSON.stringify({ version: pkg.version, builtAt: BUILT_AT, path: `/ota/${zipName}` }),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), otaBundle()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILT_AT__: JSON.stringify(BUILT_AT),
  },
})
