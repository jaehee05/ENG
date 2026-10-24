/** OMR 답안지 색 — 응시 화면(크림·초록·분홍)과 결과 화면(민트·초록). */
export type OmrTone = 'take' | 'result'

const TONE = {
  take: {
    card: 'border-[#2e9b4f] bg-[#fbf8e9]',
    line: 'border-[#2e9b4f]',
    head: 'bg-[#dfefd6] text-[#2e9b4f]',
    num: 'bg-[#e1f0d8]',
  },
  result: {
    card: 'border-[#1f8a4c] bg-[#effaf3]',
    line: 'border-[#1f8a4c]',
    head: 'bg-[#d3f5e0] text-[#1f7a45]',
    num: '',
  },
} as const

export function omrTone(tone: OmrTone) {
  return TONE[tone]
}

