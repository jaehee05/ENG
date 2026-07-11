import { useEffect, useRef, useState } from 'react'

interface PdfViewerProps {
  /** 렌더할 PDF의 다운로드 URL. */
  url: string
  /** 헤더에 표시할 제목(파일명 등). */
  title?: string
  onClose: () => void
}

type Status = 'loading' | 'done' | 'error'

/**
 * 인페이지 PDF 뷰어. pdf.js로 각 페이지를 &lt;canvas&gt;에 렌더한다.
 *
 * 다운로드 버튼·파일 링크·iframe 을 노출하지 않아 학생이 파일을 따로 저장하기
 * 어렵게 만든다(실용적 차단 — 우클릭/컨텍스트 메뉴 차단, 텍스트 선택 불가).
 * 다만 클라이언트로 전달된 바이트나 스크린샷까지 막을 수는 없다.
 */
export function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  // Esc 로 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    let pdfDoc: { numPages: number; getPage: (n: number) => Promise<unknown>; destroy: () => void } | null = null

    async function run() {
      setStatus('loading')
      setError(null)

      const pdfjsLib = await import('pdfjs-dist')
      const workerMod = await import('pdfjs-dist/build/pdf.worker.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default

      // 레인지 요청 CORS 이슈를 피하려 통째로 받아 data 로 넘긴다(pdfText.ts 와 동일).
      const res = await fetch(url)
      if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`)
      const buffer = await res.arrayBuffer()
      if (cancelled) return

      pdfDoc = (await pdfjsLib.getDocument({ data: buffer }).promise) as unknown as typeof pdfDoc
      if (cancelled || !pdfDoc) return

      const container = containerRef.current
      if (!container) return
      container.innerHTML = ''

      // 컨테이너 실제 너비에 맞춰 렌더(선명도 위해 DPR 반영, 과도한 캔버스 방지 위해 상한).
      const cssWidth = container.clientWidth || 800
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = (await pdfDoc.getPage(i)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number }
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
        }
        if (cancelled) return

        const base = page.getViewport({ scale: 1 })
        const scale = (cssWidth / base.width) * dpr
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
        canvas.className = 'rounded shadow-sm bg-white'
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        container.appendChild(canvas)
        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return
      }

      if (!cancelled) setStatus('done')
    }

    run().catch((e) => {
      if (cancelled) return
      setError(e instanceof Error ? e.message : '해설을 불러오지 못했습니다.')
      setStatus('error')
    })

    return () => {
      cancelled = true
      pdfDoc?.destroy()
    }
  }, [url])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="min-w-0 flex items-center gap-2 text-white">
          <span aria-hidden>📄</span>
          <span className="truncate text-sm font-semibold">{title ?? '해설'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-3 py-1.5 transition"
        >
          닫기
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <div
          ref={containerRef}
          className="mx-auto max-w-3xl space-y-3 select-none"
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        />
        {status === 'loading' && (
          <p className="text-center text-sm text-white/70 py-8">불러오는 중…</p>
        )}
        {status === 'error' && (
          <p className="text-center text-sm text-red-300 py-8">
            {error ?? '해설을 불러오지 못했습니다.'}
          </p>
        )}
      </div>
    </div>
  )
}
