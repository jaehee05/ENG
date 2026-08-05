// 기존 '정답 및 해설' hwpx → 내용을 비운 템플릿(assets/해설-템플릿.hwpx) 생성.
// 판형을 바꾸고 싶을 때만 쓴다. 원본 hwpx 를 unz/ 에 풀어 두고 실행:
//   unzip -q 원본.hwpx -d unz && node make_template.mjs
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const SRC = 'unz/Contents/section0.xml'
const raw = fs.readFileSync(SRC, 'utf8')
const bodyStart = raw.indexOf('>', raw.indexOf('<hs:sec')) + 1
const bodyEnd = raw.lastIndexOf('</hs:sec>')
const head = raw.slice(0, bodyStart)
const body = raw.slice(bodyStart, bodyEnd)
const tailXml = raw.slice(bodyEnd)

function topParas(s) {
  const res = []
  const re = /<hp:p(?=[\s>])|<\/hp:p>/g
  let depth = 0, start = -1, m
  while ((m = re.exec(s))) {
    if (m[0] === '</hp:p>') {
      depth--
      if (depth === 0) res.push({ start, end: m.index + m[0].length })
    } else {
      if (depth === 0) start = m.index
      depth++
    }
  }
  return res.map((r) => ({ ...r, xml: s.slice(r.start, r.end) }))
}
const text = (x) =>
  [...x.matchAll(/<hp:t(?=[\s>])[^>]*>([\s\S]*?)<\/hp:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/<hp:fwSpace\/>/g, ' ')
    .replace(/<[^>]+>/g, '')

const paras = topParas(body)
console.log('최상위 문단 수:', paras.length)

const iLabel = paras.findIndex((p) => /^\s*\d\d\.\s*\[/.test(text(p.xml)))
const iSel = paras.findIndex((p, i) => i > iLabel && /선택과목\(화법과 작문\) 해설/.test(text(p.xml)))
console.log('첫 유형 라벨 문단:', iLabel, '/ 선택과목 해설 헤더:', iSel)

const stripSeg = (x) => x.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '')
const setSoleText = (x, v) =>
  stripSeg(x).replace(/(<hp:t(?=[\s>])[^>]*>)[\s\S]*?(<\/hp:t>)/, `$1${v}$2`)

// ── 아키타입 4종 ────────────────────────────────────────────────
const A_LABEL = setSoleText(paras[iLabel].xml, '{{LABEL}}')

// 정답 해설: 첫 run 은 '정답 해설 :' (charStyle 4), 두 번째 run 이 본문
let a = stripSeg(paras[iLabel + 1].xml)
const ts = [...a.matchAll(/<hp:t(?=[\s>])[^>]*>[\s\S]*?<\/hp:t>/g)]
a = a.replace(ts[1][0], ts[1][0].replace(/(<hp:t(?=[\s>])[^>]*>)[\s\S]*?(<\/hp:t>)/, '$1{{ANSWER}}$2'))
const A_ANSWER = a

const A_WRONGLABEL = stripSeg(paras[iLabel + 2].xml) // '오답 해설'

const iWrong = paras.findIndex(
  (p, i) => i > iLabel + 2 && /^[①-⑤]/.test(text(p.xml)) && !/<hp:tbl/.test(p.xml),
)
const A_WRONG = setSoleText(paras[iWrong].xml, '{{WRONG}}')

const iBlank = paras.findIndex((p, i) => i > iWrong && text(p.xml).trim() === '' && !/<hp:tbl/.test(p.xml))
const A_BLANK = stripSeg(paras[iBlank].xml)

for (const [k, v] of Object.entries({ A_LABEL, A_ANSWER, A_WRONGLABEL, A_WRONG, A_BLANK }))
  console.log(k, v.length, '자', JSON.stringify(text(v).slice(0, 30)))

// ── 정답표 비우기 (번호 칸만 남기고 정답·배점 칸 비움) ──────────
function clearTable(tblXml) {
  const cells = [...tblXml.matchAll(/<hp:tc[\s\S]*?<\/hp:tc>/g)].map((m) => m[0])
  let out = tblXml
  for (const c of cells) {
    const addr = c.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>/)
    if (!addr) continue
    const col = +addr[1], row = +addr[2]
    if (row === 0 || col % 3 === 0) continue // 헤더행 · 번호 칸은 유지
    const cleared = c.replace(/(<hp:t(?=[\s>])[^>]*>)[\s\S]*?(<\/hp:t>)/g, '$1$2')
    if (cleared !== c) out = out.replace(c, cleared)
  }
  return out
}

let prefix = paras
  .slice(0, iLabel)
  .map((p) => p.xml)
  .join('')

// 제목 → 플레이스홀더
prefix = prefix.replace(/(<hp:t(?=[\s>])[^>]*>)2027학년도[^<]*제4회(<\/hp:t>)/, '$1{{TITLE}}$2')

// 표 3개(공통·화작·언매) 비우기
for (const t of [...prefix.matchAll(/<hp:tbl[\s\S]*?<\/hp:tbl>/g)].map((m) => m[0])) {
  if (!/번호/.test(t)) continue
  prefix = prefix.replace(t, clearTable(t))
}

const suffix = paras
  .slice(iSel)
  .map((p) => p.xml)
  .join('')

const newBody =
  prefix + '<!--BODY-->' + A_LABEL + A_ANSWER + A_WRONGLABEL + A_WRONG + A_BLANK + '<!--/BODY-->' + suffix

fs.mkdirSync('tpl', { recursive: true })
execSync('rm -rf tpl && cp -R unz tpl')
fs.writeFileSync('tpl/Contents/section0.xml', head + newBody + tailXml)
fs.rmSync('tpl/Preview/PrvText.txt', { force: true })
fs.rmSync('tpl/Preview/PrvImage.png', { force: true })
execSync('cd tpl && rm -f ../template.hwpx && zip -q -X -r ../template.hwpx mimetype . -x mimetype')
console.log('\n템플릿 생성 완료:', fs.statSync('template.hwpx').size, 'bytes')
