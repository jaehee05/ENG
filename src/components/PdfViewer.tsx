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
    const objectUrls: string[] = []

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

      // 표시 폭에 맞춰 렌더. 화질을 위해 DPR 을 반영하되, iOS WebKit 의 캔버스
      // 메모리 한계를 넘지 않도록 캔버스 픽셀 폭에 상한(MAX_PX_W)을 둔다.
      const cssWidth =
        container.clientWidth ||
        container.parentElement?.clientWidth ||
        window.innerWidth
      const dpr = window.devicePixelRatio || 1
      const MAX_PX_W = 2400
      const pxWidth = Math.min(cssWidth * dpr, MAX_PX_W)

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = (await pdfDoc.getPage(i)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number }
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
        }
        if (cancelled) return

        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: pxWidth / base.width })

        // 한 페이지만 캔버스에 렌더한 뒤 즉시 이미지로 변환하고 캔버스는 버린다.
        // → 살아있는 큰 캔버스가 항상 1개뿐이라 메모리가 터지지 않는다.
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.92),
        )
        // 캔버스 메모리 즉시 해제.
        canvas.width = 0
        canvas.height = 0
        if (cancelled) return
        if (!blob) continue

        const imgUrl = URL.createObjectURL(blob)
        objectUrls.push(imgUrl)
        const img = document.createElement('img')
        img.src = imgUrl
        img.style.width = '100%'
        img.style.height = 'auto'
        img.style.display = 'block'
        img.className = 'rounded shadow-sm bg-white'
        img.draggable = false
        container.appendChild(img)
      }

      if (!cancelled) setStatus('done')
    }

    run().catch((e) => {
      if (cancelled) return
      // WebKit 의 fetch 실패는 'Load failed' 로만 떠서 원인이 안 보인다.
      // 대개 Storage 버킷 CORS 미설정으로 인한 차단이라 안내를 덧붙인다.
      const raw = e instanceof Error ? e.message : String(e)
      const isNetwork = /load failed|failed to fetch|networkerror/i.test(raw)
      setError(
        isNetwork
          ? '해설을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.'
          : raw || '해설을 불러오지 못했습니다.',
      )
      setStatus('error')
    })

    return () => {
      cancelled = true
      objectUrls.forEach((u) => URL.revokeObjectURL(u))
      pdfDoc?.destroy()
    }
  }, [url])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 pb-3 border-b border-white/10 shrink-0"
        // 다이나믹 아일랜드/노치에 헤더가 가리지 않도록 상단 safe-area 만큼 여백 추가
        // (capacitor.config 의 contentInset:'never' 라 웹뷰가 상태바 영역까지 채움)
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
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

      <div
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
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
