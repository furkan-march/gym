import type { ReactNode, ButtonHTMLAttributes } from 'react'

/**
 * Shared design-system primitives (SPEC 32): dark charcoal, one accent,
 * >= 44px touch targets, strong numeric legibility, minimal noise.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-black font-semibold active:bg-accent-dim',
  secondary: 'bg-surface-2 text-text border border-border active:bg-border',
  ghost: 'text-text-muted active:text-text',
  danger: 'bg-danger/15 text-danger border border-danger/30 active:bg-danger/25',
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`min-h-11 rounded-xl px-4 text-[15px] transition-colors disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-6 mb-2 px-1 text-[13px] font-semibold tracking-wide text-text-muted uppercase">
      {children}
    </h2>
  )
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="text-[12px] text-text-muted">{label}</div>
      <div className="tabular mt-0.5 text-xl font-semibold">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-text-muted">{hint}</div> : null}
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center">
      <div className="text-[15px] font-medium">{title}</div>
      {body ? <div className="mt-1 text-[13px] text-text-muted">{body}</div> : null}
    </div>
  )
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors ${
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border bg-surface text-text-muted'
      }`}
    >
      {children}
    </button>
  )
}

export function Row({
  left,
  right,
  onClick,
}: {
  left: ReactNode
  right?: ReactNode
  onClick?: () => void
}) {
  const cls = 'flex min-h-11 items-center justify-between gap-3 py-2'
  if (onClick)
    return (
      <button onClick={onClick} className={`${cls} w-full text-left`}>
        <div className="min-w-0 flex-1">{left}</div>
        {right}
      </button>
    )
  return (
    <div className={cls}>
      <div className="min-w-0 flex-1">{left}</div>
      {right}
    </div>
  )
}
