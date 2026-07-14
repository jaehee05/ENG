import { unzipSync, strFromU8 } from 'fflate'
import { extractTextFromPdfFile } from './pdfText'

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** HWPX(zip) → 평문 텍스트. Contents/section*.xml 의 <hp:t> 텍스트 추출. */
function extractHwpxText(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer))
  const sectionNames = Object.keys(files)
    .filter((n) => /Contents\/section\d+\.xml$/i.test(n))
    .sort()
  const parts: string[] = []
  for (const n of sectionNames) {
    const xml = strFromU8(files[n])
    const matches = xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) ?? []
    for (const m of matches) {
      const inner = m.replace(/<[^>]+>/g, '')
      if (inner.trim()) parts.push(decodeXmlEntities(inner))
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * 시험지 파일(PDF/HWPX) → 평문 텍스트.
 * AI 등급컷 판단에 사용. 스캔(이미지) PDF는 텍스트가 거의 없을 수 있음.
 */
export async function extractExamText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) {
    return extractTextFromPdfFile(file)
  }
  if (name.endsWith('.hwpx')) {
    return extractHwpxText(await file.arrayBuffer())
  }
  throw new Error('PDF 또는 HWPX 파일만 지원합니다.')
}
