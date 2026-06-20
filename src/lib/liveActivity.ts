import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * 입력값. iSO 변환은 native 쪽이 책임지지만,
 * web 에서 보낼 때는 ms epoch 으로 직렬화한다.
 */
export interface StartClassActivityInput {
  /** 수업 장소 — Dynamic Island 좌상단 작은 텍스트로 표시. */
  location: string
  /** 시작 라벨 (예: "강의 시작"). */
  startLabel: string
  /** 종료 라벨 (예: "강의 끝"). */
  endLabel: string
  /** 수업 시작 시각 ms epoch. */
  startAtMs: number
  /** 수업 종료 시각 ms epoch. */
  endAtMs: number
}

export interface UpdateClassActivityInput
  extends Partial<StartClassActivityInput> {
  /** 어느 Activity 를 갱신할지 — start() 가 반환한 id. */
  id: string
}

export interface LiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>
  /** 새 Live Activity 시작. id 를 반환. */
  startClass(options: StartClassActivityInput): Promise<{ id: string }>
  /** 진행 중인 Activity 정보 갱신. */
  updateClass(options: UpdateClassActivityInput): Promise<void>
  /** Activity 종료 — id 생략 시 현재 모든 Activity 종료. */
  endClass(options?: { id?: string }): Promise<void>
  /** 현재 활성 Activity id 조회 (없으면 빈 문자열). */
  currentId(): Promise<{ id: string }>
}

const native = registerPlugin<LiveActivityPlugin>('LiveActivity')

/** iOS 가 아닐 때만 빠르게 차단. iOS 면 네이티브 호출 시도해서 동작 여부 판정. */
function isIos(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

export const liveActivity = {
  async isSupported(): Promise<boolean> {
    if (!isIos()) return false
    try {
      const r = await native.isSupported()
      return !!r.supported
    } catch (err) {
      // 플러그인 미등록·메서드 미존재 → 미지원으로 간주
      console.warn('[liveActivity] isSupported failed:', err)
      return false
    }
  },

  async start(input: StartClassActivityInput): Promise<string | null> {
    if (!isIos()) return null
    try {
      const r = await native.startClass(input)
      return r.id
    } catch (err) {
      console.warn('[liveActivity] start failed:', err)
      throw err
    }
  },

  async update(input: UpdateClassActivityInput): Promise<void> {
    if (!isIos()) return
    await native.updateClass(input)
  },

  async end(id?: string): Promise<void> {
    if (!isIos()) return
    try {
      await native.endClass(id ? { id } : undefined)
    } catch (err) {
      console.warn('[liveActivity] end failed:', err)
    }
  },

  async currentId(): Promise<string> {
    if (!isIos()) return ''
    try {
      const r = await native.currentId()
      return r.id
    } catch {
      return ''
    }
  },
}
