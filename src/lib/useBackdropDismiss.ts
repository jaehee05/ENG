import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent,
} from 'react'

interface Options {
  /** 모달이 열려 있는지. 닫혀 있으면 Esc 리스너를 걸지 않는다. */
  open: boolean
  /** 실제로 닫는 동작. */
  onDismiss: () => void
  /**
   * 입력 중인 내용이 있는지. true면 닫기 전에 한 번 확인을 받는다.
   * 실수로 배경을 스쳐 작성 중이던 해설이 통째로 날아가는 걸 막으려는 것.
   */
  dirty?: boolean
  /** 저장 중처럼 아예 닫으면 안 되는 상태. */
  disabled?: boolean
  /** 확인 문구. */
  confirmMessage?: string
}

/**
 * 모달 닫기 제스처 — 실수로 닫히는 두 경우를 막는다.
 *
 *  1. 모달 안에서 드래그를 시작해 커서/손가락이 배경에서 떨어진 경우.
 *     브라우저는 click 을 "누른 곳과 뗀 곳의 공통 조상"에 발생시키므로,
 *     에디터 안에서 텍스트를 선택하다 배경에서 버튼을 떼면 배경이 타깃이 된다.
 *     안쪽 stopPropagation 으로는 막을 수 없다.
 *     → 누르기 시작한 지점이 배경일 때만 닫는다.
 *  2. 입력 중인 내용이 있는데 배경을 스친 경우.
 *     → dirty 면 confirm 을 한 번 거친다.
 *
 * 배경용 핸들러를 반환하고, Esc 키 닫기(데스크탑 관례)는 훅이 직접 건다.
 * 둘 다 같은 dirty/disabled 규칙을 따른다.
 */
export function useBackdropDismiss({
  open,
  onDismiss,
  dirty = false,
  disabled = false,
  confirmMessage = '입력 중인 내용이 저장되지 않습니다. 닫을까요?',
}: Options) {
  const pressedBackdrop = useRef(false)

  const requestClose = useCallback(() => {
    if (disabled) return
    if (dirty && !window.confirm(confirmMessage)) return
    onDismiss()
  }, [disabled, dirty, confirmMessage, onDismiss])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, requestClose])

  return {
    onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      pressedBackdrop.current = e.target === e.currentTarget
    },
    onClick(e: MouseEvent<HTMLDivElement>) {
      const startedOnBackdrop = pressedBackdrop.current
      pressedBackdrop.current = false
      // 모달 내부에서 올라온 클릭이거나, 누르기는 안쪽에서 시작한 경우 무시
      if (e.target !== e.currentTarget || !startedOnBackdrop) return
      requestClose()
    },
  }
}
