import { Fragment, type ReactNode } from 'react'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 자주 쓰이는 영어 불규칙 동사 활용형. 키는 표제어(소문자), 값은 추가 활용형들.
// 규칙 활용(-s/-ed/-ing)은 표제어 + \w{0,4}로 자동 잡히니 생략.
const IRREGULAR_FORMS: Record<string, string[]> = {
  arise: ['arose', 'arisen'],
  awake: ['awoke', 'awoken'],
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  bear: ['bore', 'borne', 'born'],
  beat: ['beaten'],
  become: ['became'],
  begin: ['began', 'begun'],
  bend: ['bent'],
  bind: ['bound'],
  bite: ['bit', 'bitten'],
  bleed: ['bled'],
  blow: ['blew', 'blown'],
  break: ['broke', 'broken'],
  bring: ['brought'],
  build: ['built'],
  burn: ['burnt'],
  burst: ['burst'],
  buy: ['bought'],
  catch: ['caught'],
  choose: ['chose', 'chosen'],
  cling: ['clung'],
  come: ['came'],
  cost: ['cost'],
  creep: ['crept'],
  cut: ['cut'],
  deal: ['dealt'],
  dig: ['dug'],
  do: ['does', 'did', 'done', 'doing'],
  draw: ['drew', 'drawn'],
  drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'],
  feed: ['fed'],
  feel: ['felt'],
  fight: ['fought'],
  find: ['found'],
  flee: ['fled'],
  fly: ['flew', 'flown'],
  forbid: ['forbade', 'forbidden'],
  forget: ['forgot', 'forgotten'],
  forgive: ['forgave', 'forgiven'],
  freeze: ['froze', 'frozen'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['goes', 'went', 'gone', 'going'],
  grow: ['grew', 'grown'],
  hang: ['hung'],
  have: ['has', 'had', 'having'],
  hear: ['heard'],
  hide: ['hid', 'hidden'],
  hit: ['hit'],
  hold: ['held'],
  hurt: ['hurt'],
  keep: ['kept'],
  know: ['knew', 'known'],
  lay: ['laid'],
  lead: ['led'],
  leave: ['left'],
  lend: ['lent'],
  let: ['let'],
  lie: ['lay', 'lain'],
  light: ['lit'],
  lose: ['lost'],
  make: ['made'],
  mean: ['meant'],
  meet: ['met'],
  pay: ['paid'],
  put: ['put'],
  quit: ['quit'],
  read: ['read'],
  ride: ['rode', 'ridden'],
  ring: ['rang', 'rung'],
  rise: ['rose', 'risen'],
  run: ['ran'],
  say: ['said'],
  see: ['saw', 'seen'],
  seek: ['sought'],
  sell: ['sold'],
  send: ['sent'],
  set: ['set'],
  shake: ['shook', 'shaken'],
  shed: ['shed'],
  shine: ['shone'],
  shoot: ['shot'],
  show: ['shown'],
  shrink: ['shrank', 'shrunk'],
  shut: ['shut'],
  sing: ['sang', 'sung'],
  sink: ['sank', 'sunk'],
  sit: ['sat'],
  sleep: ['slept'],
  slide: ['slid'],
  speak: ['spoke', 'spoken'],
  spend: ['spent'],
  spread: ['spread'],
  spring: ['sprang', 'sprung'],
  stand: ['stood'],
  steal: ['stole', 'stolen'],
  stick: ['stuck'],
  sting: ['stung'],
  stink: ['stank', 'stunk'],
  strike: ['struck'],
  string: ['strung'],
  strive: ['strove', 'striven'],
  swear: ['swore', 'sworn'],
  sweep: ['swept'],
  swim: ['swam', 'swum'],
  swing: ['swung'],
  take: ['took', 'taken'],
  teach: ['taught'],
  tear: ['tore', 'torn'],
  tell: ['told'],
  think: ['thought'],
  throw: ['threw', 'thrown'],
  understand: ['understood'],
  wake: ['woke', 'woken'],
  wear: ['wore', 'worn'],
  weep: ['wept'],
  win: ['won'],
  wind: ['wound'],
  write: ['wrote', 'written'],
}

function buildPatternForToken(token: string): string {
  const lower = token.toLowerCase()
  const base = escapeRegex(token) + '\\w{0,4}'
  const extras = IRREGULAR_FORMS[lower] ?? []
  if (extras.length === 0) return base
  const alts = [base, ...extras.map(escapeRegex)]
  return `(?:${alts.join('|')})`
}

function buildHeadPattern(head: string): RegExp | null {
  const trimmed = head.trim()
  if (!trimmed) return null
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) {
    return new RegExp(`\\b(${buildPatternForToken(tokens[0])})\\b`, 'gi')
  }
  // 구동사·숙어: 첫 토큰은 활용형까지, 나머지는 그대로(공백은 \s+로 유연)
  const parts = [buildPatternForToken(tokens[0])]
  for (let i = 1; i < tokens.length; i++) {
    parts.push(escapeRegex(tokens[i]))
  }
  return new RegExp(`\\b(${parts.join('\\s+')})\\b`, 'gi')
}

export function highlightHead(text: string, head: string): ReactNode {
  if (!text || !head) return text
  const re = buildHeadPattern(head)
  if (!re) return text
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) out.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>)
    out.push(
      <strong key={key++} className="font-bold text-slate-900">
        {m[1]}
      </strong>,
    )
    last = start + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return out
}
