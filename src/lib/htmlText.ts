/**
 * HTML 문자열에서 학생/번역에 쓰일 텍스트만 추출.
 * - <script>, <style>, <head> 무시
 * - <br> / 블록 요소(p, div, li, tr, h1~6) 경계에서 줄바꿈 추가
 * - 표는 셀 사이 공백, 행 끝에 줄바꿈
 */
export function extractTextFromHtml(html: string): string {
  if (typeof window === 'undefined' || !html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blockTags = new Set([
    'P',
    'DIV',
    'LI',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'SECTION',
    'ARTICLE',
    'HEADER',
    'FOOTER',
  ])
  let out = ''
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD') return
    if (tag === 'BR') {
      out += '\n'
      return
    }
    if (tag === 'TR') {
      for (const child of Array.from(el.childNodes)) walk(child)
      out += '\n'
      return
    }
    if (tag === 'TD' || tag === 'TH') {
      for (const child of Array.from(el.childNodes)) walk(child)
      out += '  '
      return
    }
    for (const child of Array.from(el.childNodes)) walk(child)
    if (blockTags.has(tag)) out += '\n'
  }
  if (doc.body) walk(doc.body)
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
