import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import type { ExplStyle } from '../lib/types'
import { AUTO_REPLACE } from '../lib/angleBrackets'

const HILITE_COLORS = [
  { name: '노랑', color: '#fff3a0' },
  { name: '초록', color: '#c6f6c1' },
  { name: '분홍', color: '#ffc9de' },
  { name: '파랑', color: '#c3e4ff' },
  { name: '주황', color: '#ffd9a8' },
  { name: '보라', color: '#e3d3ff' },
]

const TEXT_COLORS = [
  { name: '검정', color: '#1e293b' },
  { name: '빨강', color: '#dc2626' },
  { name: '파랑', color: '#2563eb' },
  { name: '초록', color: '#16a34a' },
  { name: '보라', color: '#7c3aed' },
]

function newStyleId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID ? c.randomUUID() : `s${Date.now()}${Math.floor(Math.random() * 1000)}`
}

/** 붙여넣은 HTML에서 프래그먼트만 뽑고 위험/불필요 태그 제거(서식은 유지). */
function cleanPastedHtml(html: string): string {
  const m = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i)
  let frag = m ? m[1] : html
  frag = frag
    .replace(/<(style|script|title|xml|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(meta|link|html|body|head|xml|o:p)[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  return stripFontFamily(frag)
}

/**
 * 글꼴 지정만 걷어낸다. 볼드·색 같은 서식은 그대로 둔다.
 *
 * 한글·워드에서 붙여넣으면 조각마다 제 글꼴이 인라인으로 따라온다. 그대로
 * 두면 해설 안에서 글자체가 들쭉날쭉해진다 — 해설 글꼴은 앱이 정한다.
 * (문자열 치환 대신 DOM 으로 지우는 이유: font-family 값에 따옴표가 섞여 있어
 *  정규식으로 자르면 `"맑은 고딕"` 같은 찌꺼기가 남는다.)
 */
function stripFontFamily(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.body.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      el.style.removeProperty('font-family')
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style')
    })
    doc.body.querySelectorAll('font[face]').forEach((el) => el.removeAttribute('face'))
    return doc.body.innerHTML
  } catch {
    return html
  }
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '해설을 입력하세요…',
  styles,
  onStylesChange,
  chars,
  onCharsChange,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** 미리 지정한 스타일 목록. 있으면 적용 버튼이 표시됨. */
  styles?: ExplStyle[]
  /** 있으면 스타일 관리(추가/수정/삭제) UI가 표시됨. */
  onStylesChange?: (list: ExplStyle[]) => void
  /** 미리 등록해 둔 문자표. 있으면 눌러서 넣는 버튼이 표시됨. */
  chars?: string[]
  /** 있으면 문자표 관리(추가/삭제) UI가 표시됨. */
  onCharsChange?: (list: string[]) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null)
  const [handle, setHandle] = useState<{ left: number; top: number } | null>(null)
  const [mgr, setMgr] = useState(false)
  const [draft, setDraft] = useState<ExplStyle | null>(null)
  const [charMgr, setCharMgr] = useState(false)
  const [charDraft, setCharDraft] = useState('')

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  // 최신 onChange 를 들고 있는다. 아래 beforeinput 은 네이티브 리스너라 한 번만
  // 걸리는데, 부모가 매번 새 함수를 넘기면 처음 것에 붙잡히기 때문이다.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  /**
   * 부등호를 홑화살괄호로 바꿔 넣는다 (AUTO_REPLACE 참고).
   *
   * React 의 onBeforeInput 이 아니라 네이티브 리스너를 쓰는 이유: contentEditable
   * 에서는 합성 이벤트가 실제 입력을 못 막을 때가 있다. 한글은 조합 중에
   * beforeinput 이 여러 번 오는데, 부등호는 조합 대상이 아니라 insertText 로
   * 한 번에 들어와 끼어들 여지가 없다.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function onBeforeInput(ev: Event) {
      const e = ev as InputEvent
      if (e.inputType !== 'insertText' || !e.data) return
      const next = AUTO_REPLACE[e.data]
      if (!next) return
      e.preventDefault()
      document.execCommand('insertText', false, next)
      if (el) onChangeRef.current(el.innerHTML)
    }
    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
  }, [])

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

  // ── 선택 영역과 교차하는 블록(문단) 목록 ──
  function blocksInSelection(): HTMLElement[] {
    const sel = window.getSelection()
    const editor = ref.current
    if (!sel || sel.rangeCount === 0 || !editor) return []
    const range = sel.getRangeAt(0)
    const blocks: HTMLElement[] = []
    editor.childNodes.forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && range.intersectsNode(n)) {
        blocks.push(n as HTMLElement)
      }
    })
    if (blocks.length === 0) {
      const b = blockOfSelection()
      if (b) blocks.push(b)
    }
    return blocks
  }
  function applyParaStyle(b: HTMLElement, s: ExplStyle) {
    if (s.marginLeft != null) b.style.marginLeft = s.marginLeft ? `${s.marginLeft}pt` : ''
    if (s.marginRight != null) b.style.marginRight = s.marginRight ? `${s.marginRight}pt` : ''
    if (s.firstLine != null) {
      if (s.firstLine >= 0) {
        b.style.textIndent = s.firstLine ? `${s.firstLine}pt` : ''
        b.style.paddingLeft = ''
      } else {
        // 내어쓰기: 첫 줄은 왼쪽에 붙고 이후 줄이 들여쓰짐
        b.style.textIndent = `${s.firstLine}pt`
        b.style.paddingLeft = `${-s.firstLine}pt`
      }
    }
  }

  // ── 미리 지정한 스타일을 선택 영역에 적용 ──
  function applyStyle(s: ExplStyle) {
    ref.current?.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const hasChar = s.bold || s.underline || !!s.color || !!s.highlight
    const hasPara = s.marginLeft != null || s.marginRight != null || s.firstLine != null

    // 문단 서식 대상 블록을 문자 서식 적용 전에 미리 확보
    let blocks = hasPara ? blocksInSelection() : []

    // 문자 서식: 선택 영역을 span으로 감싸기
    if (hasChar && !sel.isCollapsed) {
      const range = sel.getRangeAt(0)
      const span = document.createElement('span')
      if (s.bold) span.style.fontWeight = '700'
      if (s.underline) span.style.textDecoration = 'underline'
      if (s.color) span.style.color = s.color
      if (s.highlight) span.style.backgroundColor = s.highlight
      try {
        span.appendChild(range.extractContents())
        range.insertNode(span)
      } catch {
        // ignore
      }
    }

    // 문단 서식: 블록에 여백/들여쓰기 적용
    if (hasPara) {
      if (blocks.length === 0) {
        document.execCommand('formatBlock', false, 'div')
        blocks = blocksInSelection()
      }
      blocks.forEach((b) => applyParaStyle(b, s))
    }

    sel.removeAllRanges()
    emit()
  }

  function saveDraft() {
    if (!draft || !onStylesChange) return
    const name = draft.name.trim()
    if (!name) return
    const list = styles ?? []
    const clean: ExplStyle = {
      id: draft.id,
      name,
      ...(draft.bold ? { bold: true } : {}),
      ...(draft.underline ? { underline: true } : {}),
      ...(draft.color ? { color: draft.color } : {}),
      ...(draft.highlight ? { highlight: draft.highlight } : {}),
      ...(draft.marginLeft ? { marginLeft: draft.marginLeft } : {}),
      ...(draft.marginRight ? { marginRight: draft.marginRight } : {}),
      ...(draft.firstLine ? { firstLine: draft.firstLine } : {}),
    }
    const exists = list.some((s) => s.id === clean.id)
    onStylesChange(exists ? list.map((s) => (s.id === clean.id ? clean : s)) : [...list, clean])
    setDraft(null)
  }
  function removeStyle(id: string) {
    if (!onStylesChange) return
    onStylesChange((styles ?? []).filter((s) => s.id !== id))
    if (draft?.id === id) setDraft(null)
  }

  // ── 문자표 ──
  /** 커서 자리에 그대로 넣는다. 서식이 아니라 글자라 insertText 를 쓴다. */
  function insertChar(ch: string) {
    ref.current?.focus()
    document.execCommand('insertText', false, ch)
    emit()
  }
  function addChar() {
    if (!onCharsChange) return
    // 한 번에 여러 개를 붙여넣는 경우가 있다 — 공백으로 갈라 따로 등록한다.
    const added = charDraft.split(/\s+/).filter(Boolean)
    if (added.length === 0) return
    const list = chars ?? []
    // 이미 있는 건 넣지 않는다. 같은 버튼이 두 번 생기면 헷갈리기만 한다.
    onCharsChange([...list, ...added.filter((c) => !list.includes(c))])
    setCharDraft('')
  }
  function removeChar(ch: string) {
    if (!onCharsChange) return
    onCharsChange((chars ?? []).filter((c) => c !== ch))
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

      {/* 미리 지정한 스타일 적용 + 관리 */}
      {(styles?.length || onStylesChange) && (
        <div
          className="flex flex-wrap items-center gap-1 px-1.5 py-1.5 border-b border-slate-200 bg-white"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-[11px] text-slate-400 mr-0.5">스타일</span>
          {(styles ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => applyStyle(s)}
              title={`${s.name} 적용`}
              className="h-7 px-2 inline-flex items-center rounded-md border border-slate-300 text-xs hover:bg-slate-100"
              style={{
                fontWeight: s.bold ? 700 : 400,
                textDecoration: s.underline ? 'underline' : undefined,
                color: s.color,
                backgroundColor: s.highlight,
              }}
            >
              {s.name}
            </button>
          ))}
          {!(styles?.length) && onStylesChange && (
            <span className="text-[11px] text-slate-400">지정된 스타일 없음</span>
          )}
          {onStylesChange && (
            <button
              type="button"
              onClick={() => {
                setMgr((v) => !v)
                setDraft(null)
              }}
              className="h-7 px-2 inline-flex items-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-100"
              title="스타일 관리"
            >
              ⚙ 관리
            </button>
          )}
        </div>
      )}

      {/* 문자표 — 미리 등록해 둔 기호를 눌러서 넣는다 */}
      {(chars?.length || onCharsChange) && (
        <div
          className="flex flex-wrap items-center gap-1 px-1.5 py-1.5 border-b border-slate-200 bg-white"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-[11px] text-slate-400 mr-0.5">문자</span>
          {(chars ?? []).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => insertChar(c)}
              title={`${c} 넣기`}
              className="h-7 min-w-[1.75rem] px-1.5 inline-flex items-center justify-center rounded-md border border-slate-300 text-sm hover:bg-slate-100 active:bg-slate-200"
            >
              {c}
            </button>
          ))}
          {!chars?.length && onCharsChange && (
            <span className="text-[11px] text-slate-400">등록된 문자 없음</span>
          )}
          {onCharsChange && (
            <button
              type="button"
              onClick={() => setCharMgr((v) => !v)}
              className="h-7 px-2 inline-flex items-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-100"
              title="문자표 관리"
            >
              ⚙ 관리
            </button>
          )}
        </div>
      )}

      {/* 문자표 관리 패널 */}
      {charMgr && onCharsChange && (
        <div className="border-b border-slate-200 bg-slate-50 px-2.5 py-2.5 space-y-2">
          {(chars ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(chars ?? []).map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white pl-2 pr-1 py-1 text-sm"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => removeChar(c)}
                    className="text-slate-400 hover:text-red-600 text-xs px-0.5"
                    aria-label={`${c} 삭제`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={charDraft}
              onChange={(e) => setCharDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addChar()
                }
              }}
              placeholder="넣을 문자 (예: ㉠ ㉡ ⇒ ∴) — 띄어쓰면 여러 개"
              className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              type="button"
              onClick={addChar}
              disabled={!charDraft.trim()}
              className="shrink-0 rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
            >
              추가
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            등록해 두면 모든 해설 입력칸에서 같은 버튼이 뜹니다. 키보드로 치기
            번거로운 기호를 넣어두세요.
          </p>
        </div>
      )}

      {/* 스타일 관리 패널 */}
      {mgr && onStylesChange && (
        <div className="border-b border-slate-200 bg-slate-50 px-2.5 py-2.5 space-y-2">
          {(styles ?? []).length > 0 && (
            <div className="space-y-1">
              {(styles ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="truncate px-1.5 py-0.5 rounded"
                    style={{
                      fontWeight: s.bold ? 700 : 400,
                      textDecoration: s.underline ? 'underline' : undefined,
                      color: s.color,
                      backgroundColor: s.highlight,
                    }}
                  >
                    {s.name}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-900"
                      onClick={() => setDraft({ ...s })}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => removeStyle(s.id)}
                    >
                      삭제
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {draft ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="스타일 이름 (예: 정답근거)"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, bold: !draft.bold })}
                  className={`h-7 w-8 rounded-md border text-xs font-bold ${
                    draft.bold ? 'bg-brand-100 border-brand-300 text-brand-700' : 'bg-white border-slate-300'
                  }`}
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, underline: !draft.underline })}
                  className={`h-7 w-8 rounded-md border text-xs underline ${
                    draft.underline ? 'bg-brand-100 border-brand-300 text-brand-700' : 'bg-white border-slate-300'
                  }`}
                >
                  U
                </button>
                <span className="mx-0.5 h-5 w-px bg-slate-300" />
                <span className="text-[11px] text-slate-400">글자색</span>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, color: undefined })}
                  className={`h-6 w-6 rounded border text-[10px] ${!draft.color ? 'ring-2 ring-brand-400' : ''}`}
                  title="없음"
                >
                  ✕
                </button>
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: c.color })}
                    className={`h-6 w-6 rounded border border-slate-300 ${draft.color === c.color ? 'ring-2 ring-brand-400' : ''}`}
                    style={{ backgroundColor: c.color }}
                    title={c.name}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">형광</span>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, highlight: undefined })}
                  className={`h-6 w-6 rounded border text-[10px] ${!draft.highlight ? 'ring-2 ring-brand-400' : ''}`}
                  title="없음"
                >
                  ✕
                </button>
                {HILITE_COLORS.map((h) => (
                  <button
                    key={h.color}
                    type="button"
                    onClick={() => setDraft({ ...draft, highlight: h.color })}
                    className={`h-6 w-6 rounded border border-slate-300 ${draft.highlight === h.color ? 'ring-2 ring-brand-400' : ''}`}
                    style={{ backgroundColor: h.color }}
                    title={h.name}
                  />
                ))}
              </div>
              <div className="border-t border-slate-100 pt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-16 shrink-0">왼쪽 여백</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.marginLeft ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        marginLeft: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <span className="text-[11px] text-slate-400">pt</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-16 shrink-0">오른쪽 여백</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.marginRight ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        marginRight: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <span className="text-[11px] text-slate-400">pt</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-16 shrink-0">첫 줄</span>
                  <select
                    value={
                      !draft.firstLine ? 'none' : draft.firstLine > 0 ? 'indent' : 'hanging'
                    }
                    onChange={(e) => {
                      const mode = e.target.value
                      const mag = Math.abs(draft.firstLine ?? 0) || 10
                      setDraft({
                        ...draft,
                        firstLine:
                          mode === 'none' ? undefined : mode === 'indent' ? mag : -mag,
                      })
                    }}
                    className="rounded-md border border-slate-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="none">없음</option>
                    <option value="indent">들여쓰기</option>
                    <option value="hanging">내어쓰기</option>
                  </select>
                  {draft.firstLine != null && draft.firstLine !== 0 && (
                    <>
                      <input
                        type="number"
                        min={0}
                        value={Math.abs(draft.firstLine)}
                        onChange={(e) => {
                          const mag = e.target.value === '' ? 0 : Number(e.target.value)
                          const sign = (draft.firstLine ?? 0) < 0 ? -1 : 1
                          setDraft({ ...draft, firstLine: mag ? sign * mag : undefined })
                        }}
                        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                      <span className="text-[11px] text-slate-400">pt</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 px-1"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={!draft.name.trim()}
                  className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setDraft({ id: newStyleId(), name: '', bold: false, underline: false })
              }
              className="w-full rounded-md border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:bg-white"
            >
              ＋ 새 스타일 추가
            </button>
          )}
        </div>
      )}

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
