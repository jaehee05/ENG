/**
 * 브라우저에서 PDF 파일 → 평문 텍스트.
 * pdfjs-dist를 동적 import해서 초기 번들 사이즈 영향 최소화.
 */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  const workerMod = await import('pdfjs-dist/build/pdf.worker.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((it) =>
        typeof (it as { str?: unknown }).str === 'string'
          ? (it as { str: string }).str
          : '',
      )
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) parts.push(text)
  }
  return parts.join('\n\n')
}
