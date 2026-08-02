import type { VocabResult } from './types'

/**
 * 지난 시험 결과표를 붙여넣어 문항별 기록으로 되돌린다.
 *
 * 결과 화면을 그대로 복사하면 두 가지 모양 중 하나로 붙는다.
 *
 * 1) 탭으로 나뉜 한 줄 = 한 문항
 *    `1\tsharpen\t날을 갈다\t날카롭게 하다\t정답`
 * 2) 칸마다 줄이 바뀐 형태 (HTML 표를 그대로 복사하면 이렇게 된다)
 *    `1` / `sharpen` / `날을 갈다` / `날카롭게 하다` / `정답` …
 *
 * 두 경우 모두 "정답" 또는 "오답" 한 단어가 문항의 끝을 알린다. 그것을
 * 기준으로 자른다 — 뜻에 쉼표나 대괄호가 섞여 있어도 흔들리지 않는다.
 */

/** 문항 끝을 알리는 표시. 이 두 단어만 결과로 인정한다. */
const RESULT_MARK = new Set(['정답', '오답'])

/**
 * 표 머리글. 본문과 헷갈리지 않게 걸러낸다.
 *
 * '뜻'·'단어'·'제출' 처럼 학생이 실제로 쓸 법한 말은 넣지 않는다 — 걸러 버리면
 * 멀쩡한 답이 사라진다. 열 이름 '정답' 은 RESULT_MARK 쪽에서 걸린다.
 */
const HEADER = new Set(['#', '번호', '영단어', '내 답', '내답', '결과'])

function isRowNumber(s: string): boolean {
  return /^\d+$/.test(s)
}

/** 앞뒤 공백·따옴표를 털어낸다. 표 복사에 " 가 섞여 오는 경우가 있다. */
function clean(s: string): string {
  return s.trim().replace(/^"(.*)"$/s, '$1').trim()
}

export interface ParsedResultTable {
  rows: VocabResult[]
  /** 형식이 안 맞아 건너뛴 덩어리 수. 0 이 아니면 사용자에게 알린다. */
  skipped: number
}

/**
 * 한 문항 덩어리를 VocabResult 로. 덩어리는 결과 표시를 뺀 나머지다.
 *
 * 기대하는 모양은 [번호?, 영단어, 내 답, 정답뜻] 이다. 내 답이 비어 있으면
 * (미응답) 한 칸이 줄어드니 그 경우도 받는다.
 */
function toRow(parts: string[], correct: boolean): VocabResult | null {
  const p = [...parts]
  if (p.length > 0 && isRowNumber(p[0])) p.shift()
  if (p.length < 2) return null
  const en = p[0]
  if (!en) return null
  if (p.length === 2) {
    return { en, ko: p[1], userAnswer: '', correct }
  }
  // 3칸을 넘으면 가운데를 내 답으로 합친다 — 답에 줄바꿈이 있었던 경우다.
  const ko = p[p.length - 1]
  const userAnswer = p.slice(1, p.length - 1).join(' ')
  return { en, ko, userAnswer, correct }
}

export function parseVocabResultTable(raw: string): ParsedResultTable {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const rows: VocabResult[] = []
  let skipped = 0

  // 1) 탭이 있으면 한 줄이 한 문항이다.
  if (lines.some((l) => l.includes('\t'))) {
    for (const line of lines) {
      const cells = line.split('\t').map(clean)
      const last = cells[cells.length - 1] ?? ''
      if (!RESULT_MARK.has(last)) {
        // 머리글 줄은 조용히 넘긴다. 그 밖의 줄만 건너뛴 것으로 센다.
        const allHeader = cells.every((c) => HEADER.has(c) || RESULT_MARK.has(c))
        if (!allHeader) skipped++
        continue
      }
      const row = toRow(cells.slice(0, -1), last === '정답')
      if (row) rows.push(row)
      else skipped++
    }
    return { rows, skipped }
  }

  // 2) 칸마다 줄이 바뀐 형태 — 결과 표시가 나올 때까지 모았다가 자른다.
  let buf: string[] = []
  for (const line of lines) {
    const v = clean(line)
    if (!v) continue
    if (RESULT_MARK.has(v)) {
      // 열 이름 '정답' 은 앞에 쌓인 것이 없어 여기서 걸러진다.
      if (buf.length === 0) continue
      const row = toRow(buf, v === '정답')
      if (row) rows.push(row)
      else skipped++
      buf = []
      continue
    }
    // 머리글은 버퍼에 담지 않는다. 담으면 첫 문항이 머리글을 삼킨다.
    if (HEADER.has(v)) continue
    buf.push(v)
  }
  // 마지막 덩어리에 결과 표시가 없으면 버린다 — 정답/오답을 모르면 쓸 수 없다.
  if (buf.length > 0) skipped++

  return { rows, skipped }
}
