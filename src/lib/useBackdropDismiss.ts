import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react'

interface Options {
  /** 배경을 눌렀을 때 실제로 닫는 동작. */
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
 * 모달 배경 클릭으로 닫기 — 실수로 닫히는 두 경우를 막는다.
 *
 *  1. 모달 안에서 드래그를 시작해 손가락/커서가 배경에서 떨어진 경우.
 *     click 은 누른 곳이 아니라 뗀 곳 기준이라 이것도 배경 클릭으로 잡혔다.
 *     → 누르기 시작한 지점이 배경일 때만 닫는다.
 *  2. 입력 중인 내용이 있는데 배경을 스친 경우.
 *     → dirty 면 confirm 을 한 번 거친다.
 *
 * 반환값을 배경 div 에 그대로 펼쳐 넣으면 된다.
 */
export function useBackdropDismiss({
  onDismiss,
  dirty = false,
  disabled = false,
  confirmMessage = '입력 중인 내용이 저장되지 않습니다. 닫을까요?',
}: Options) {
  const pressedBackdrop = useRef(false)

  return {
    onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      pressedBackdrop.current = e.target === e.currentTarget
    },
    onClick(e: MouseEvent<HTMLDivElement>) {
      const startedOnBackdrop = pressedBackdrop.current
      pressedBackdrop.current = false
      if (disabled) return
      // 모달 내부에서 올라온 클릭이거나, 누르기는 안쪽에서 시작한 경우 무시
      if (e.target !== e.currentTarget || !startedOnBackdrop) return
      if (dirty && !window.confirm(confirmMessage)) return
      onDismiss()
    },
  }
}
