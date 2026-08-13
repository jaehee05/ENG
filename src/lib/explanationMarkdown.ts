import {
  mockLinkLabels,
  mockWrongChoiceEntries,
  questionPoints,
  type KoreanMock,
  type KoreanMockQuestion,
} from './types'

/**
 * 입력해 둔 해설을 '해설 스킬 원고' 형식의 마크다운으로 뽑는다.
 *
 * 저장된 값에는 선지 번호가 없다 — 화면이 원문자를 자동으로 붙이기 때문이다.
 * 파일로 내보낼 때는 그 번호가 글자로 남아야 하므로 여기서 붙인다.
 *
 * 형식은 docs/해설-스킬/SKILL.md 의 원고 규격과 같다. 그대로 hwpx 변환기에
 * 넣을 수 있게 하려는 것이고, 유형 라벨만 비워 둔다(저장해 두는 값이 없다).
 */

const CIRCLED = ['①', '②', '③', '④', '⑤']

/** 1~5 → 원문자. 범위를 벗어나면 숫자 그대로. */
function circled(n: number): string {
  return CIRCLED[n - 1] ?? String(n)
}

/**
 * 리치텍스트 HTML → 마크다운.
 *
 * 굵게·기울임만 살린다. 밑줄과 색은 마크다운에 대응이 없어 글자만 남기고,
 * 표는 마크다운 표로, 이미지는 자리만 [이미지] 로 적는다.
 *
 * 목록 표지는 '-' 를 쓴다. '*' 로 시작하는 줄은 원고 형식에서 문항 총평이라,
 * 목록이 총평으로 읽히면 변환기가 엉뚱한 자리에 넣는다.
 */
export function htmlToMarkdown(html: string | undefined): string {
  if (!html) return ''
  if (typeof window === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')

  function inline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    const inner = Array.from(el.childNodes).map(inline).join('')
    if (tag === 'BR') return '\n'
    if (tag === 'IMG') return '[이미지]'
    if (!inner.trim()) return inner
    // 굵게·기울임은 태그로도 style 로도 들어온다 (편집기마다 다르다).
    const style = el.getAttribute('style') ?? ''
    const bold = tag === 'B' || tag === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/.test(style)
    const italic = tag === 'I' || tag === 'EM' || /font-style:\s*italic/.test(style)
    let out = inner
    if (italic) out = `*${out}*`
    if (bold) out = `**${out}**`
    return out
  }

  function tableToMarkdown(table: Element): string {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length === 0) return ''
    const cells = rows.map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((td) =>
        Array.from(td.childNodes).map(inline).join('').replace(/\n+/g, ' ').trim(),
      ),
    )
    const width = Math.max(...cells.map((r) => r.length))
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
    const lines = [
      `| ${pad(cells[0]).join(' | ')} |`,
      `| ${Array(width).fill('---').join(' | ')} |`,
      ...cells.slice(1).map((r) => `| ${pad(r).join(' | ')} |`),
    ]
    return lines.join('\n')
  }

  const blocks: string[] = []
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      if (t.trim()) blocks.push(t.trim())
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    if (tag === 'SCRIPT' || tag === 'STYLE') return
    if (tag === 'TABLE') {
      const md = tableToMarkdown(el)
      if (md) blocks.push(md)
      return
    }
    if (tag === 'LI') {
      const t = Array.from(el.childNodes).map(inline).join('').trim()
      if (t) blocks.push(`- ${t}`)
      return
    }
    if (tag === 'P' || tag === 'DIV' || /^H[1-6]$/.test(tag)) {
      const t = Array.from(el.childNodes)
        .filter((c) => !(c.nodeType === Node.ELEMENT_NODE && ['TABLE', 'UL', 'OL'].includes((c as Element).tagName.toUpperCase())))
        .map(inline)
        .join('')
        .trim()
      if (t) blocks.push(t)
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const ct = (child as Element).tagName.toUpperCase()
          if (ct === 'TABLE' || ct === 'UL' || ct === 'OL') walk(child)
        }
      }
      return
    }
    if (tag === 'UL' || tag === 'OL') {
      for (const child of Array.from(el.childNodes)) walk(child)
      return
    }
    const t = inline(el).trim()
    if (t) blocks.push(t)
  }

  for (const child of Array.from(doc.body.childNodes)) walk(child)

  /**
   * 문장 중간에서 끊긴 줄을 다시 붙인다.
   *
   * 저장된 해설은 PDF 에서 붙여넣은 것이 많아 눈에 보이던 줄마다 블록(<div>,
   * <br>)이 생겨 있다. 그대로 옮기면 한 문장이 서너 줄로 쪼개져 나온다.
   * 표·목록·보충(→)만 줄을 지키고 나머지 본문은 한 문단으로 잇는다.
   */
  const isSpecial = (t: string) => /^(-\s|\||→|⇨|➔|#)/.test(t)
  const merged: string[] = []
  for (const raw of blocks) {
    const b = isSpecial(raw) ? raw : raw.replace(/\s*\n\s*/g, ' ').trim()
    const prev = merged[merged.length - 1]
    if (b && prev && !isSpecial(b) && !isSpecial(prev)) {
      merged[merged.length - 1] = `${prev} ${b}`.replace(/\s{2,}/g, ' ')
    } else if (b) {
      merged.push(b)
    }
  }
  return merged.join('\n').trim()
}

/** 한 문항을 원고 형식 한 덩어리로. 해설이 없으면 null. */
function questionToMarkdown(q: KoreanMockQuestion): string | null {
  const correct = htmlToMarkdown(q.explanation)
  // mark 는 화면에서 붙이는 것과 같은 원문자다 — 파일에도 같은 글자를 남긴다.
  const wrongs = mockWrongChoiceEntries(q).map((e) => ({
    mark: e.mark,
    text: htmlToMarkdown(e.html),
  }))
  const legacyWrong = htmlToMarkdown(q.explanationWrong)
  const note = htmlToMarkdown(q.examinerNote)
  const links = mockLinkLabels(q.linkedSource)
  if (!correct && wrongs.length === 0 && !legacyWrong && !note && links.length === 0)
    return null

  const lines: string[] = []
  const points = questionPoints(q)
  lines.push(`${String(q.number).padStart(2, '0')}. [  ]${points === 3 ? ' (3점)' : ''}`)
  if (links.length) lines.push(links.map((l) => `[${l}]`).join(' '))
  lines.push(`정답 해설 : ${circled(q.answer)} ${correct}`.trimEnd())
  if (note) lines.push(`→ ${note}`)
  if (wrongs.length > 0 || legacyWrong) {
    lines.push('오답 해설')
    for (const w of wrongs) lines.push(`${w.mark} ${w.text}`.trimEnd())
    if (legacyWrong) lines.push(legacyWrong)
  }
  return lines.join('\n')
}

/** 시험지 하나의 해설 전체를 원고 형식 마크다운으로. */
export function mockToMarkdown(mock: KoreanMock): string {
  const out: string[] = [`제목: ${mock.title}`, '']

  const section = (label: string, questions: KoreanMockQuestion[]) => {
    const blocks = [...questions]
      .sort((a, b) => a.number - b.number)
      .map(questionToMarkdown)
      .filter((b): b is string => b !== null)
    if (blocks.length === 0) return
    out.push(`[${label}]`, '', blocks.join('\n\n'), '')
  }

  section('공통과목', mock.questions ?? [])
  for (const el of mock.electives ?? []) section(el.name, el.questions ?? [])

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/** 브라우저에서 파일로 내려받기. 라이브러리 없이 Blob + a[download]. */
export function downloadMarkdown(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
