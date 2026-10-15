import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackdropDismiss } from '../../lib/useBackdropDismiss'
import { cx } from './cx'

/**
 * 아래에서 올라오는 시트. 화면마다 따로 만들던 모달(fixed inset-0 … items-end
 * sm:items-center)을 이걸로 모은다. 아이폰에선 바닥에 붙고, sm(640) 이상에선
 * 가운데 창으로 뜬다.
 *
 * 닫기 규칙은 useBackdropDismiss 그대로 — 바깥을 누르기 시작해 바깥에서 뗄 때만,
 * 입력 중이면(dirty) 한 번 묻고, 저장 중(disabled)이면 닫지 않는다. 손잡이를
 * 끌어내려 닫는 것도 같은 규칙을 거친다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  dirty,
  disabled,
  size = 'md',
  showClose = true,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** 시트 아래 고정 버튼 줄. 내용이 길어 스크롤돼도 남는다. */
  footer?: ReactNode
  dirty?: boolean
  disabled?: boolean
  /** sm 이상 창 폭. 편집 폼처럼 넓어야 하면 lg. */
  size?: 'md' | 'lg'
  showClose?: boolean
}) {
  const titleId = useId()
  const backdrop = useBackdropDismiss({ open, onDismiss: onClose, dirty, disabled })
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)

  if (!open) return null

  const safeBottom = { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 sm:p-6 anim-dim-in"
      onPointerDown={backdrop.onPointerDown}
      onClick={backdrop.onClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cx(
          'w-full bg-white rounded-t-[24px] sm:rounded-[24px] shadow-sheet max-h-[90dvh] flex flex-col',
          'anim-sheet-up sm:anim-pop-in',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
        // 끄는 동안엔 애니메이션을 끈다 — 남은 animation 의 transform 이 손가락을 이긴다.
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, animation: 'none' } : undefined}
      >
        {/* 손잡이 — 아이폰에서만. 끌어내려 닫는다. */}
        <div
          className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none cursor-grab"
          onPointerDown={(e) => {
            dragStart.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (dragStart.current == null) return
            setDragY(Math.max(0, e.clientY - dragStart.current))
          }}
          onPointerUp={() => {
            const pulled = dragY
            dragStart.current = null
            setDragY(0)
            if (pulled > 110) backdrop.requestClose()
          }}
          onPointerCancel={() => {
            dragStart.current = null
            setDragY(0)
          }}
        >
          <span className="h-1 w-9 rounded-full bg-slate-200" />
        </div>
        {(title || showClose) && (
          <div className="flex items-start justify-between gap-3 px-6 pt-3 sm:pt-6 pb-3">
            {title ? (
              <h2 id={titleId} className="text-[19px] font-bold text-slate-900 tracking-tight">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {showClose && (
              <button
                type="button"
                onClick={backdrop.requestClose}
                disabled={disabled}
                aria-label="닫기"
                className="pressable -mr-2 -mt-1 h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 active:bg-slate-100 disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-4"
          style={footer ? undefined : safeBottom}
        >
          {children}
        </div>
        {footer && (
          <div className="px-6 pt-2 flex gap-2" style={safeBottom}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
