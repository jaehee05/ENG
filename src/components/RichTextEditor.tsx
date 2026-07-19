import { useEffect, useRef } from 'react'

/**
 * 간단한 리치텍스트 에디터 (contentEditable + execCommand).
 * 볼드/밑줄/형광펜/들여쓰기(좌/우). 출력은 HTML 문자열.
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

  // 최초 마운트 시에만 초기값 주입(입력 중 커서 튐 방지).
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

  const btn =
    'h-8 min-w-[2rem] px-2 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200'

  return (
    <div className="rounded-lg border border-slate-300 overflow-hidden bg-white">
      <div
        className="flex flex-wrap gap-1 p-1.5 border-b border-slate-200 bg-slate-50"
        // 버튼 클릭 시 에디터 선택영역이 풀리지 않게.
        onMouseDown={(e) => e.preventDefault()}
      >
        <button type="button" onClick={() => exec('bold')} className={`${btn} font-bold`} title="볼드">
          B
        </button>
        <button type="button" onClick={() => exec('underline')} className={`${btn} underline`} title="밑줄">
          U
        </button>
        <button
          type="button"
          onClick={() => exec('hiliteColor', '#fff3a0')}
          className={btn}
          title="형광펜"
        >
          <span className="rounded px-1" style={{ backgroundColor: '#fff3a0' }}>
            형광
          </span>
        </button>
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
          지우기
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={emit}
        data-placeholder={placeholder}
        className="rte-content min-h-[8rem] max-h-[24rem] overflow-y-auto px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none"
        suppressContentEditableWarning
      />
    </div>
  )
}
