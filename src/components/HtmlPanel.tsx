import { useEffect, useRef, useState } from 'react'

interface Props {
  html: string
  maxWidth?: number
  className?: string
}

/**
 * 신뢰된 HTML 한 덩어리를 격리된 iframe(sandbox)으로 렌더.
 * 부모 페이지의 CSS/스크립트와 충돌하지 않고, 콘텐츠 높이에 맞춰 자동 리사이즈.
 */
export function HtmlPanel({ html, maxWidth, className }: Props) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState<number>(120)

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    let observer: ResizeObserver | null = null

    function attach() {
      const doc = iframe?.contentDocument
      if (!doc?.body) return
      const measure = () => {
        const next = Math.max(
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight ?? 0,
        )
        if (next > 0) setH(next + 4)
      }
      measure()
      observer?.disconnect()
      observer = new ResizeObserver(measure)
      observer.observe(doc.body)
    }

    iframe.addEventListener('load', attach)
    // srcDoc은 load 이벤트가 즉시 발생하지 않을 수 있어 한 번 더 시도
    const t = setTimeout(attach, 50)
    return () => {
      clearTimeout(t)
      iframe.removeEventListener('load', attach)
      observer?.disconnect()
    }
  }, [html])

  return (
    <iframe
      ref={ref}
      title="도표 미리보기"
      sandbox="allow-same-origin"
      srcDoc={html}
      className={className}
      style={{
        width: '100%',
        maxWidth: maxWidth ?? '100%',
        border: 0,
        height: h,
        display: 'block',
      }}
    />
  )
}
