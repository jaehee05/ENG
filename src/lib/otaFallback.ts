import { CapacitorUpdater } from '@capgo/capacitor-updater'

/**
 * Capgo 를 못 탈 때의 예비 업데이트 통로.
 *
 * 2026-10-24 Capgo 가 요금제 상태를 잘못 읽어 기기 다운로드를 막은 적이 있다
 * ('Blocked - plan upgrade required'). 그동안 웹(Vercel)에는 새 화면이 올라가 있었는데
 * 앱만 옛 번들에 묶였다. 그래서 웹 빌드가 같은 번들을 zip 으로 함께 올려 두고
 * (vite.config.ts 의 otaBundle), 앱이 그걸 직접 받는다.
 *
 * Capgo 가 멀쩡하면 이 통로는 아무것도 하지 않는다 — 웹 번들이 지금 번들보다
 * LAG_MS 이상 새것일 때만 움직인다. 같은 커밋을 Capgo(Actions)와 Vercel 이 몇 분
 * 차이로 따로 빌드하니, 그 차이로는 움직이지 않게 넉넉히 잡는다.
 *
 * 받은 번들은 next() 로 ‘다음에 앱을 열 때’ 적용한다. set() 은 즉시 새로 고쳐서
 * 시험 답안을 입력하던 화면이 날아간다.
 */
const MANIFEST_URL = 'https://kjhedu-engh.vercel.app/ota/latest.json'
const LAG_MS = 30 * 60 * 1000
/** 앱이 켜지고 Capgo 가 먼저 해 볼 시간을 준다. */
const START_DELAY_MS = 20_000

interface Manifest {
  version: string
  builtAt: number
  path: string
}

async function run(): Promise<void> {
  const res = await fetch(MANIFEST_URL, { cache: 'no-store' })
  if (!res.ok) return
  const m = (await res.json()) as Manifest
  if (!m.builtAt || !m.path || m.builtAt - __BUILT_AT__ < LAG_MS) return

  // Capgo 가 그사이 같은 것(또는 더 새것)을 받아 다음 실행을 기다리고 있으면 둔다.
  const version = `${m.version}-web${m.builtAt}`
  const { bundles } = await CapacitorUpdater.list()
  const ready = bundles.find((b) => b.version === version && b.status === 'success')
  if (ready) {
    await CapacitorUpdater.next({ id: ready.id })
    return
  }

  // 전에 받아 봤다가 망가진 번들(status 'error')이면 다시 받지 않는다 — 실패를 되풀이한다.
  if (bundles.some((b) => b.version === version)) return

  const bundle = await CapacitorUpdater.download({
    url: new URL(m.path, MANIFEST_URL).toString(),
    version,
  })
  await CapacitorUpdater.next({ id: bundle.id })
}

/** 네이티브 앱에서만 부른다(main.tsx). 실패해도 앱에는 아무 영향이 없어야 한다. */
export function startOtaFallback(): void {
  setTimeout(() => {
    run().catch(() => {
      // 네트워크·플러그인 오류는 조용히 넘긴다. 다음 실행 때 다시 본다.
    })
  }, START_DELAY_MS)
}
