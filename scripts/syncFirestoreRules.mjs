/**
 * 소스에서 쓰는 컬렉션을 훑어 firestore.rules 를 맞춘다.
 *
 * 전체 허용(match /{document=**})을 없앤 뒤로는 규칙에 안 적힌 컬렉션이 앱에서
 * 그냥 안 보인다. 새 컬렉션을 만들고 규칙에 적는 걸 잊으면 조용히 403 이 나서
 * 원인을 찾기 어렵다. 그래서 손으로 적지 않고 여기서 뽑아 쓴다.
 *
 *   node scripts/syncFirestoreRules.mjs          어긋나면 알려주고 실패 (빌드 전 검사)
 *   node scripts/syncFirestoreRules.mjs --write  파일을 고쳐 맞춤
 *
 * CLOSED 에 적힌 것은 절대 열지 않는다. 개인정보나 열쇠가 들어 있는 곳이라,
 * 자동으로 열어주면 사람이 눈치채기 전에 공개된다 — 실제로 users 가 그랬다.
 * 새로 만든 컬렉션이 그런 성격이면 여기에 이름을 적으면 된다.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RULES_PATH = join(ROOT, 'firestore.rules')
const SRC = join(ROOT, 'src')

const BEGIN = '    // ── 여기부터 자동 생성 (scripts/syncFirestoreRules.mjs) ──'
const END = '    // ── 자동 생성 끝 ──'

/** 클라이언트가 직접 만지면 안 되는 것. Cloud Functions(Admin SDK)로만 다룬다. */
const CLOSED = new Set(['users', 'sessions', 'settings'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/**
 * `collection(db, 'x')` / `doc(db, 'x', ...)` 의 첫 인자를 모은다.
 *
 * 이름을 변수로 넘기는 곳은 못 잡는다. 지금 코드에는 그런 데가 없지만,
 * 생기면 이 스크립트가 조용히 놓치므로 그때는 CLOSED 처럼 손으로 적어야 한다.
 */
function collectionsInSource() {
  const found = new Set()
  const re = /\b(?:collection|doc)\(\s*db\s*,\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(re)) found.add(m[1])
  }
  return [...found].sort()
}

function buildBlock(open) {
  const width = Math.max(...open.map((c) => c.length))
  const lines = open.map(
    (c) =>
      `    match /${c}/{doc=**}${' '.repeat(width - c.length)} { allow read, write: if true; }`,
  )
  return [BEGIN, ...lines, END].join('\n')
}

const used = collectionsInSource()
const open = used.filter((c) => !CLOSED.has(c))
const closedInUse = used.filter((c) => CLOSED.has(c))

const rules = readFileSync(RULES_PATH, 'utf8')
const start = rules.indexOf(BEGIN)
const stop = rules.indexOf(END)
if (start === -1 || stop === -1) {
  console.error(`firestore.rules 에 자동 생성 표시가 없습니다.\n  ${BEGIN}\n  ${END}`)
  process.exit(1)
}

const next = rules.slice(0, start) + buildBlock(open) + rules.slice(stop + END.length)
const write = process.argv.includes('--write')

if (next === rules) {
  console.log(
    `firestore.rules 최신 상태 — 열린 컬렉션 ${open.length}개, 닫은 것 ${closedInUse.join(', ') || '없음'}`,
  )
  process.exit(0)
}

if (write) {
  writeFileSync(RULES_PATH, next)
  console.log(`firestore.rules 를 맞췄습니다 — 열린 컬렉션 ${open.length}개.`)
  console.log('⚠ 파일만 고쳤습니다. 실제로 적용하려면 규칙을 배포해야 합니다:')
  console.log('    firebase deploy --only firestore:rules --project engh-c5082')
  process.exit(0)
}

const before = new Set(
  [...rules.slice(start, stop).matchAll(/match \/([A-Za-z0-9_]+)\//g)].map((m) => m[1]),
)
const added = open.filter((c) => !before.has(c))
const removed = [...before].filter((c) => !open.includes(c))

console.error('firestore.rules 가 소스와 어긋납니다.')
if (added.length) console.error(`  규칙에 없는 컬렉션: ${added.join(', ')}`)
if (removed.length) console.error(`  이제 안 쓰는 컬렉션: ${removed.join(', ')}`)
console.error('\n  npm run rules:sync 로 맞춘 뒤, 규칙을 배포해야 실제로 적용됩니다.')
console.error('  개인정보나 열쇠를 담는 컬렉션이면 열지 말고 이 스크립트의 CLOSED 에 적으세요.')
process.exit(1)
