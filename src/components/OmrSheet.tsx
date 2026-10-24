import type { ReactNode } from 'react'
import { cx } from './ui'
import { omrTone, type OmrTone } from '../lib/omrTheme'

/**
 * 종이 OMR 카드 모양의 답안지 틀. 응시 화면(분홍 칸에 칠하기)과 결과 화면(정답·선택률)이
 * 같은 틀을 쓰고, 칸 안에 무엇을 그릴지만 다르다(renderAnswers).
 *
 * 실제 답안지처럼 다섯 문항마다 굵은 줄로 끊고, 5의 배수 번호는 진하게 쓴다.
 */

/** 카드 머리 글자를 한 자씩 띄운다 — '공 통 과 목'. */
function spaced(s: string): string {
  return [...s.replace(/\s+/g, '')].join(' ')
}

export function OmrCard({
  title,
  tone,
  className,
  children,
}: {
  title: string
  tone: OmrTone
  className?: string
  children: ReactNode
}) {
  const t = omrTone(tone)
  return (
    <div className={cx('rounded-xl border-2 overflow-hidden', t.card, className)}>
      <div className={cx('py-1.5 text-center text-[13px] font-bold border-b-2 whitespace-pre', t.head, t.line)}>
        {spaced(title)}
      </div>
      {children}
    </div>
  )
}

export interface OmrRowItem {
  number: number
  /** 화면 전체에서의 순서 — 포커스·스크롤 대상. */
  key: string | number
}

/**
 * 문번 | 답란 한 단. 다섯 문항씩 묶어 굵은 줄로 나눈다.
 * rowClass/numClass 로 지금 문항·확인 필요 같은 줄 표시를 얹는다.
 */
export function OmrColumn({
  items,
  tone,
  renderAnswers,
  onRowClick,
  rowOverlay,
  numClass,
  rowHeight = 'h-[31px]',
  className,
}: {
  items: OmrRowItem[]
  tone: OmrTone
  renderAnswers: (number: number) => ReactNode
  onRowClick?: (number: number) => void
  /** 줄 위에 덮는 테두리(지금 문항 등). */
  rowOverlay?: (number: number) => string | null
  numClass?: (number: number) => string | null
  rowHeight?: string
  className?: string
}) {
  const t = omrTone(tone)
  const groups: OmrRowItem[][] = []
  for (let i = 0; i < items.length; i += 5) groups.push(items.slice(i, i + 5))
  return (
    <div className={cx('min-w-0', className)}>
      <div className={cx('grid grid-cols-[2.1rem_1fr] text-[10px] font-semibold border-b-2', t.line, tone === 'take' ? 'text-[#2e9b4f]' : 'text-[#1f7a45]')}>
        <div className={cx('py-1 text-center border-r-2', t.line, t.num)}>문번</div>
        <div className="py-1 text-center whitespace-pre">{'답   란'}</div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} className={cx(gi > 0 && 'border-t-2', t.line)}>
          {g.map((it) => {
            const overlay = rowOverlay?.(it.number)
            return (
              <div
                key={it.key}
                data-qnum={it.number}
                onClick={onRowClick ? () => onRowClick(it.number) : undefined}
                className={cx(
                  'relative grid grid-cols-[2.1rem_1fr] items-stretch scroll-mt-24 scroll-mb-64',
                  onRowClick && 'cursor-pointer',
                )}
              >
                <div
                  className={cx(
                    'flex items-center justify-center border-r-2 text-[12px] tabular-nums',
                    t.line,
                    t.num,
                    it.number % 5 === 0 ? 'font-extrabold text-[#2e9b4f]' : 'text-slate-700',
                    numClass?.(it.number),
                  )}
                >
                  {it.number}
                </div>
                <div className={cx('flex items-center justify-around px-1 min-w-0', rowHeight)}>
                  {renderAnswers(it.number)}
                </div>
                {overlay && <div aria-hidden className={cx('pointer-events-none absolute inset-0 z-10', overlay)} />}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** 응시 화면의 분홍 타원 칸. 칠하면 까만 타원(번호는 가린다 — 종이처럼). */
export function TakeBubble({ n, filled }: { n: number; filled: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 w-[17px] h-[24px] items-center justify-center rounded-full border-[1.5px] text-[9.5px] font-medium tabular-nums',
        filled ? 'bg-[#141414] border-[#141414] text-transparent' : 'border-[#e0507a] text-[#e0507a]',
      )}
    >
      {n}
    </span>
  )
}
