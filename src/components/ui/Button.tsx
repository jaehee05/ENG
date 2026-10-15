import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass'

export function Button({
  variant,
  size,
  block,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  /** 처리 중 — 눌리지 않게 하고 글자 대신 점 세 개를 보인다. */
  loading?: boolean
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex gap-1" aria-label="처리 중">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:300ms]" />
        </span>
      ) : (
        children
      )}
    </button>
  )
}
