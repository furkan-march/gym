/**
 * Settings toggle row: full-width 44px+ touch target with a switch control.
 * Neutral styling per SPEC 32; optional muted hint line under the label.
 */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] text-text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-accent bg-accent' : 'border-border bg-surface-2'
        }`}
      >
        <span
          className={`absolute top-[2px] left-0 h-[22px] w-[22px] rounded-full transition-transform ${
            checked ? 'translate-x-[23px] bg-black' : 'translate-x-[3px] bg-text-muted'
          }`}
        />
      </span>
    </button>
  )
}
