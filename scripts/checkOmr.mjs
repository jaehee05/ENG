/**
 * OMR 사진 판독(api/read-omr.ts)을 정답과 맞춰 본다.
 *
 * docs/omr/ 에 직접 칠한 사진과 같은 이름의 정답 .json 을 넣어 두면, 사진마다
 * 판독을 돌려 문항별로 맞았는지, low 로 표시한 문항이 몇 개인지 보여 준다.
 * 가장 눈여겨볼 것은 "틀렸는데 high" — 학생 화면에서 표시 없이 지나가는 오판이다.
 *
 *   ANTHROPIC_API_KEY=… node scripts/checkOmr.mjs              docs/omr 의 사진 전부
 *   ANTHROPIC_API_KEY=… node scripts/checkOmr.mjs filled-1.jpg  특정 사진만
 *   node scripts/checkOmr.mjs --url https://…/api/read-omr      배포된 함수로 (키 불필요)
 *
 * 정답 .json 모양 (answers 의 키가 곧 판독할 번호, 0 = 일부러 비운 문항):
 *   { "subject": "korean", "answers": { "1": 3, "2": 5, …, "45": 1 }, "electiveMark": 2 }
 *
 * 사진은 앱과 같은 한도(긴 변 2576px, 3.7MP, JPEG)로 줄여서 보낸다 — 줄이는 데
 * macOS 의 sips 를 쓴다. 원본 그대로 보내면 앱에서와 다른 조건을 재게 된다.
 */

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OMR_DIR = join(ROOT, 'docs', 'omr')
const SAMPLE = 'korean-sample.png'
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])

// 앱(KoreanMockTake.tsx)과 같은 값.
const MAX_DIMENSION = 2576
const MAX_PIXELS = 3_700_000

const args = process.argv.slice(2)
const urlIdx = args.indexOf('--url')
const url = urlIdx >= 0 ? args[urlIdx + 1] : null
const names = args.filter((a, i) => !a.startsWith('--') && (urlIdx < 0 || i !== urlIdx + 1))

function listCases() {
  const picked = names.length
    ? names
    : readdirSync(OMR_DIR).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()) && f !== SAMPLE)
  return picked.map((name) => {
    const image = existsSync(name) ? name : join(OMR_DIR, name)
    const answerPath = join(dirname(image), basename(image, extname(image)) + '.json')
    return { name: basename(image), image, answerPath }
  })
}

function sipsSize(path) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { encoding: 'utf8' })
  const w = Number(/pixelWidth: (\d+)/.exec(out)?.[1])
  const h = Number(/pixelHeight: (\d+)/.exec(out)?.[1])
  return { w, h }
}

/** 앱의 resizeImageForUpload 와 같은 규칙으로 줄인 JPEG 의 base64. */
function prepareImage(path, tmp) {
  const { w, h } = sipsSize(path)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)))
  const out = join(tmp, 'omr.jpg')
  const sipsArgs = ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85']
  if (scale < 1) sipsArgs.push('--resampleWidth', String(Math.floor(w * scale)))
  execFileSync('sips', [...sipsArgs, path, '--out', out], { stdio: 'ignore' })
  const resized = sipsSize(out)
  return { base64: readFileSync(out).toString('base64'), ...resized }
}

/** api/read-omr.ts 의 handler 를 가짜 req/res 로 직접 부른다(배포 없이). */
async function callLocal(body) {
  const { default: handler } = await import(join(ROOT, 'api', 'read-omr.ts'))
  return new Promise((resolve, reject) => {
    let status = 200
    const res = {
      status(code) {
        status = code
        return res
      },
      json(data) {
        resolve({ status, data })
        return res
      },
    }
    handler({ method: 'POST', body }, res).catch(reject)
  })
}

async function callRemote(body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}

const CIRCLED = ['·', '①', '②', '③', '④', '⑤']

async function runCase({ name, image, answerPath }) {
  if (!existsSync(answerPath)) {
    console.log(`\n■ ${name} — 정답 파일(${basename(answerPath)})이 없어 건너뜀`)
    return null
  }
  const truth = JSON.parse(readFileSync(answerPath, 'utf8'))
  const expected = new Map(Object.entries(truth.answers ?? {}).map(([k, v]) => [Number(k), Number(v)]))
  const numbers = [...expected.keys()].sort((a, b) => a - b)

  const tmp = mkdtempSync(join(tmpdir(), 'omr-'))
  let img
  try {
    img = prepareImage(image, tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  const body = { image: img.base64, mediaType: 'image/jpeg', numbers, subject: truth.subject ?? 'korean' }

  const started = Date.now()
  let status, data
  try {
    ;({ status, data } = url ? await callRemote(body) : await callLocal(body))
  } catch (err) {
    console.log(`\n■ ${name}\n  실패: ${err.cause?.message ?? err.message}`)
    return { name, failed: true }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n■ ${name}  (${img.w}×${img.h}, ${(img.base64.length / 1e6).toFixed(2)}MB base64, ${secs}초)`)
  if (status !== 200) {
    console.log(`  실패 HTTP ${status}: ${data.error ?? JSON.stringify(data)}`)
    return { name, failed: true }
  }

  const got = new Map((data.answers ?? []).map((a) => [a.number, a]))
  let right = 0
  let low = 0
  const wrongHigh = []
  for (const n of numbers) {
    const want = expected.get(n)
    const a = got.get(n) ?? { choice: 0, confidence: 'low' }
    const ok = a.choice === want
    if (ok) right++
    if (a.confidence === 'low') low++
    if (!ok && a.confidence === 'high') wrongHigh.push(n)
    const mark = ok ? '✓' : '✗'
    const conf = a.confidence === 'low' ? ' low' : ''
    const note = a.note ? `  (${a.note})` : ''
    console.log(
      `  ${String(n).padStart(2)}번 ${mark} 정답 ${CIRCLED[want] ?? want} 판독 ${CIRCLED[a.choice] ?? a.choice}${conf}${note}`,
    )
  }
  if (truth.electiveMark || data.electiveMark) {
    const ok = truth.electiveMark === data.electiveMark
    console.log(`  선택과목 ${ok ? '✓' : '✗'} 정답 ${truth.electiveMark ?? '-'} 판독 ${data.electiveMark ?? '-'}`)
  }
  console.log(
    `  → ${right}/${numbers.length} 일치, low ${low}문항` +
      (wrongHigh.length ? `, ⚠ 틀렸는데 high: ${wrongHigh.join(', ')}번` : ', 틀렸는데 high 없음'),
  )
  return { name, right, total: numbers.length, low, wrongHigh: wrongHigh.length }
}

const cases = listCases()
if (cases.length === 0) {
  console.log(`docs/omr/ 에 판독할 사진이 없습니다(${SAMPLE} 은 빈 카드라 제외).`)
  process.exit(0)
}
if (!url && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY 를 넣거나 --url 로 배포된 함수를 지정하세요.')
  process.exit(1)
}

const results = []
for (const c of cases) results.push(await runCase(c))
const done = results.filter((r) => r && !r.failed)
if (done.length > 1) {
  const right = done.reduce((s, r) => s + r.right, 0)
  const total = done.reduce((s, r) => s + r.total, 0)
  const low = done.reduce((s, r) => s + r.low, 0)
  const wrongHigh = done.reduce((s, r) => s + r.wrongHigh, 0)
  console.log(`\n합계: ${right}/${total} 일치, low ${low}문항, 틀렸는데 high ${wrongHigh}문항`)
}
if (results.some((r) => r?.failed || r?.wrongHigh)) process.exitCode = 1
