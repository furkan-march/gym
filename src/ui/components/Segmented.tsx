export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div>
      {label ? <div className="mb-1 text-[11px] text-text-muted">{label}</div> : null}
      <div className="flex overflow-hidden rounded-xl border border-border bg-surface-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 flex-1 px-2 text-[13px] transition-colors ${
              value === o.value ? 'bg-accent/15 font-semibold text-accent' : 'text-text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 1–5 rating input for readiness/feedback sliders. */
export function Rating({
  value,
  onChange,
  label,
}: {
  value: number | null
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[14px]">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            aria-label={`${label} ${n}`}
            onClick={() => onChange(n)}
            className={`tabular h-11 w-11 rounded-lg border text-[15px] ${
              value === n
                ? 'border-accent bg-accent/15 font-semibold text-accent'
                : 'border-border bg-surface-2 text-text-muted'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
