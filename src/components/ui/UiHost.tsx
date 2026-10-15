import { useEffect } from 'react'
import { closeDialog, registerHost, useUiState, type DialogRequest } from './dialog'
import { cx } from './cx'
import { buttonClass } from './buttonClass'

/** 확인창·토스트를 그리는 곳. App 맨 위에 한 번만 둔다. */
export function UiHost() {
  const { dialogs, toasts } = useUiState()
  useEffect(() => registerHost(), [])
  const top = dialogs[0]
  return (
    <>
      {top && <Dialog key={top.id} req={top} />}
      <div
        className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
        // 아이폰 하단 탭바(약 56px) 위로 띄운다.
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'anim-pop-in max-w-sm rounded-2xl px-4 py-3 text-[14px] font-medium text-white shadow-float',
              t.tone === 'error' ? 'bg-red-600/95' : 'bg-slate-900/90',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </>
  )
}

function Dialog({ req }: { req: DialogRequest }) {
  const isConfirm = req.kind === 'confirm'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDialog(req.id, false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [req.id])

  function ok() {
    req.onConfirm?.()
    closeDialog(req.id, true)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-6 anim-dim-in"
      onClick={(e) => {
        // 바깥을 누르면 ‘취소’ — 알림창은 ‘확인’과 같다(답이 하나뿐이라).
        if (e.target === e.currentTarget) closeDialog(req.id, !isConfirm)
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={req.title ? `dlg-${req.id}-t` : undefined}
        aria-describedby={`dlg-${req.id}-m`}
        className="w-full max-w-[340px] rounded-[24px] bg-white p-6 shadow-float anim-pop-in"
      >
        {req.title && (
          <h2 id={`dlg-${req.id}-t`} className="text-[18px] font-bold text-slate-900 mb-2">
            {req.title}
          </h2>
        )}
        <p
          id={`dlg-${req.id}-m`}
          className={cx(
            'whitespace-pre-line break-keep',
            req.title ? 'text-[15px] text-slate-600' : 'text-[16px] font-medium text-slate-800',
          )}
        >
          {req.message}
        </p>
        <div className="mt-6 flex gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={() => closeDialog(req.id, false)}
              className={buttonClass({ variant: 'secondary', block: true })}
            >
              {req.cancelText ?? '취소'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={ok}
            className={buttonClass({ variant: req.danger ? 'danger' : 'primary', block: true })}
          >
            {req.confirmText ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}
