import { useEffect, useRef, type ClipboardEvent } from 'react'

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

/**
 * 간단한 리치텍스트 에디터 (contentEditable + execCommand).
 * 볼드/밑줄/형광펜(여러 색)/들여쓰기. HWPX 등에서 붙여넣기 시 서식 유지.
 * 출력은 HTML 문자열.
 */
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

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const html = e.clipboardData.getData('text/html')
    if (html) {
      e.preventDefault()
      document.execCommand('insertHTML', false, cleanPastedHtml(html))
      emit()
    }
    // html 이 없으면 기본(평문) 붙여넣기 그대로
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
        {/* 형광펜 색 */}
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
        <button type="button" onClick={() => exec('outdent')} className={btn} title="내어쓰기">
          ⇤
        </button>
        <button type="button" onClick={() => exec('indent')} className={btn} title="들여쓰기">
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
      <div
        ref={ref}
        contentEditable
        onInput={emit}
        onPaste={onPaste}
        data-placeholder={placeholder}
        className="rte-content min-h-[8rem] max-h-[24rem] overflow-y-auto px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none"
        suppressContentEditableWarning
      />
    </div>
  )
}
