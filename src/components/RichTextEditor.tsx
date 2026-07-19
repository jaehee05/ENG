import { useEffect, useRef, useState, type ClipboardEvent } from 'react'

const HILITE_COLORS = [
  { name: '노랑', color: '#fff3a0' },
  { name: '초록', color: '#c6f6c1' },
  { name: '분홍', color: '#ffc9de' },
  { name: '파랑', color: '#c3e4ff' },
  { name: '주황', color: '#ffd9a8' },
  { name: '보라', color: '#e3d3ff' },
]

/** 붙여넣은 HTML에서 프래그먼트만 뽑고 위험/불필요 태그 제거(서식은 유지). */
function cleanPastedHtml(html: string): string {
  const m = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i)
  let frag = m ? m[1] : html
  frag = frag
    .replace(/<(style|script|title|xml|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(meta|link|html|body|head|xml|o:p)[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  return frag
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '해설을 입력하세요…',
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null)
  const [handle, setHandle] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus()
    try {
      document.execCommand('styleWithCSS', false, 'true')
    } catch {
      // ignore
    }
    document.execCommand(cmd, false, arg)
    emit()
  }

  // ── 들여쓰기: 커서가 있는 블록의 margin-left 직접 조절 ──
  function blockOfSelection(): HTMLElement | null {
    const sel = window.getSelection()
    const editor = ref.current
    if (!sel || sel.rangeCount === 0 || !editor) return null
    const node = sel.getRangeAt(0).startContainer
    let el: HTMLElement | null =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
    while (el && el !== editor && el.parentElement !== editor) el = el.parentElement
    return el && el !== editor ? el : null
  }
  function indent(delta: number) {
    const block = blockOfSelection()
    if (!block) {
      document.execCommand(delta > 0 ? 'indent' : 'outdent')
      emit()
      return
    }
    const cur = parseInt(block.style.marginLeft || '0', 10) || 0
    const next = Math.max(0, cur + delta * 24)
    block.style.marginLeft = next ? `${next}px` : ''
    emit()
  }

  // ── 이미지 리사이즈 핸들 위치 계산 ──
  function updateHandle(img: HTMLImageElement | null) {
    if (!img || !wrapRef.current) {
      setHandle(null)
      return
    }
    const ir = img.getBoundingClientRect()
    const wr = wrapRef.current.getBoundingClientRect()
    setHandle({ left: ir.right - wr.left, top: ir.bottom - wr.top })
  }
  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement
    if (t.tagName === 'IMG') {
      const img = t as HTMLImageElement
      setSelImg(img)
      updateHandle(img)
    } else {
      setSelImg(null)
      setHandle(null)
    }
  }
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!selImg) return
    const image = selImg
    const startX = e.clientX
    const startW = image.getBoundingClientRect().width
    function move(ev: PointerEvent) {
      const w = Math.max(40, startW + (ev.clientX - startX))
      image.style.width = `${Math.round(w)}px`
      image.style.height = 'auto'
      updateHandle(image)
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      emit()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const html = e.clipboardData.getData('text/html')
    if (html) {
      e.preventDefault()
      document.execCommand('insertHTML', false, cleanPastedHtml(html))
      emit()
    }
  }

  const btn =
    'h-8 min-w-[2rem] px-2 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200'

  return (
    <div className="rounded-lg border border-slate-300 overflow-hidden bg-white">
      <div
        className="flex flex-wrap items-center gap-1 p-1.5 border-b border-slate-200 bg-slate-50"
        onMouseDown={(e) => e.preventDefault()}
      >
        <button type="button" onClick={() => exec('bold')} className={`${btn} font-bold`} title="볼드">
          B
        </button>
        <button type="button" onClick={() => exec('underline')} className={`${btn} underline`} title="밑줄">
          U
        </button>
        <span className="mx-0.5 h-5 w-px bg-slate-300" />
        {HILITE_COLORS.map((h) => (
          <button
            key={h.color}
            type="button"
            onClick={() => exec('hiliteColor', h.color)}
            title={`형광 ${h.name}`}
            className="h-6 w-6 rounded border border-slate-300"
            style={{ backgroundColor: h.color }}
          />
        ))}
        <button
          type="button"
          onClick={() => exec('hiliteColor', 'transparent')}
          className={`${btn} text-xs`}
          title="형광 제거"
        >
          형광✕
        </button>
        <span className="mx-0.5 h-5 w-px bg-slate-300" />
        <button type="button" onClick={() => indent(-1)} className={btn} title="내어쓰기">
          ⇤
        </button>
        <button type="button" onClick={() => indent(1)} className={btn} title="들여쓰기">
          ⇥
        </button>
        <button
          type="button"
          onClick={() => exec('removeFormat')}
          className={`${btn} text-xs`}
          title="서식 지우기"
        >
          서식지우기
        </button>
      </div>
      <div ref={wrapRef} className="relative">
        <div
          ref={ref}
          contentEditable
          onInput={emit}
          onPaste={onPaste}
          onClick={onEditorClick}
          onScroll={() => updateHandle(selImg)}
          data-placeholder={placeholder}
          className="rte-content min-h-[8rem] max-h-[24rem] overflow-y-auto px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none"
          suppressContentEditableWarning
        />
        {handle && (
          <div
            onPointerDown={startResize}
            style={{ left: handle.left - 8, top: handle.top - 8 }}
            className="absolute z-10 h-4 w-4 rounded-sm border-2 border-white bg-brand-600 cursor-nwse-resize shadow"
            title="드래그하여 크기 조절"
          />
        )}
      </div>
    </div>
  )
}
