import { Link, useNavigate } from 'react-router-dom'

interface Props {
  /**
   * 돌아갈 경로. history.back() 대신 명시적 경로를 쓰는 이유:
   * 푸시 알림으로 바로 들어오거나 앱을 다시 열었을 때는 뒤로 갈 기록이 없어
   * 아무 데도 못 가거나 앱 밖으로 나가버린다.
   */
  to: string
  label: string
  /**
   * 값이 있으면 이동 전에 확인을 받는다.
   * 응시 중인 시험에서 나가면 입력한 답이 사라지므로 그때 쓴다.
   */
  confirmMessage?: string
}

const CLS =
  'inline-flex items-center gap-1 -ml-1 px-1 py-1 touch:py-1.5 text-xs text-slate-500 hover:text-slate-900 transition'

/** 화면 좌상단 뒤로가기. 상세·응시·결과처럼 목록에서 들어온 화면에 둔다. */
export function BackLink({ to, label, confirmMessage }: Props) {
  const navigate = useNavigate()

  if (!confirmMessage) {
    return (
      <Link to={to} className={CLS}>
        <span aria-hidden>←</span>
        {label}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm(confirmMessage)) return
        navigate(to)
      }}
      className={CLS}
    >
      <span aria-hidden>←</span>
      {label}
    </button>
  )
}
