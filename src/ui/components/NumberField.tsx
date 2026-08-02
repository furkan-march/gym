/**
 * Fast one-thumb numeric input (SPEC 11): +/- steppers around a direct numeric
 * input. Decimal-safe (rounds to 2 places to avoid float dust). The suffix is
 * folded into the label line when a label exists so the digits always keep
 * horizontal space in narrow set rows (a 375px viewport gives each field
 * ~107px; inline suffixes starved the input to zero width).
 */
export function NumberField({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
  suffix,
  wide,
}: {
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  label?: string
  suffix?: string
  wide?: boolean
}) {
  const round = (v: number) => Math.round(v * 100) / 100
  const bump = (dir: 1 | -1) => {
    const base = value ?? 0
    const next = round(base + dir * step)
    onChange(next < min ? min : next)
  }
  return (
    <div className={wide ? 'min-w-0 flex-1' : ''}>
      {label ? (
        <div className="mb-1 truncate text-[11px] text-text-muted">
          {label}
          {suffix ? ` · ${suffix}` : ''}
        </div>
      ) : null}
      <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface-2">
        <button
          aria-label={`decrease ${label ?? 'value'}`}
          className="min-h-11 w-8 flex-none text-lg text-text-muted active:bg-border"
          onClick={() => bump(-1)}
        >
          −
        </button>
        <input
          inputMode="decimal"
          aria-label={label}
          className="tabular w-full min-w-0 flex-1 bg-transparent text-center text-[16px] font-semibold outline-none"
          value={value ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.')
            if (raw === '') return onChange(null)
            const n = Number(raw)
            if (!Number.isNaN(n)) onChange(round(n))
          }}
        />
        {!label && suffix ? (
          <span className="self-center pr-1 text-[12px] text-text-muted">{suffix}</span>
        ) : null}
        <button
          aria-label={`increase ${label ?? 'value'}`}
          className="min-h-11 w-8 flex-none text-lg text-text-muted active:bg-border"
          onClick={() => bump(1)}
        >
          +
        </button>
      </div>
    </div>
  )
}
