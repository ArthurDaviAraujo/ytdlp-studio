import { useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react'
import { ChevronDown, Info, Loader2 } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors active:scale-[0.98] disabled:opacity-40',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-[15px]',
        size === 'lg' && 'h-13 px-5 text-base',
        variant === 'primary' && 'bg-accent text-white active:bg-accent-hover',
        variant === 'secondary' && 'border border-line bg-panel-2 text-text active:bg-panel-3',
        variant === 'ghost' && 'text-muted active:text-text',
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 py-2 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-5">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-4 text-muted">{hint}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-panel-3 ring-1 ring-line')}>
        <span className={cx('absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </span>
    </button>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean }[] }) {
  return (
    <div className="flex rounded-xl border border-line bg-panel-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors disabled:opacity-35', value === o.value ? 'bg-panel-3 font-medium text-text shadow-sm ring-1 ring-line' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cx('h-11 w-full appearance-none rounded-xl border border-line bg-panel-2 pr-9 pl-3.5 text-[15px] text-text outline-none focus:border-info', className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('h-11 w-full rounded-xl border border-line bg-panel-2 px-3.5 text-[15px] text-text outline-none placeholder:text-faint focus:border-info', className)} />
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</div>
      {children}
      {hint && <div className="text-[13px] text-faint">{hint}</div>}
    </div>
  )
}

export function Range({ label, value, onChange, min, max, step = 1, format }: { label: ReactNode; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-[14px]">
        <span>{label}</span>
        <span className="font-mono text-[13px] text-muted tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="block h-6 w-full accent-[#ff4d4d]" />
    </div>
  )
}

/** Seção que abre e fecha (no celular, menos rolagem) */
export function Section({ title, icon, badge, children, defaultOpen = false }: { title: ReactNode; icon?: ReactNode; badge?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        {icon && <span className="text-muted">{icon}</span>}
        <span className="flex-1 text-[15px] font-medium">{title}</span>
        {badge}
        <ChevronDown className={cx('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-4 border-t border-line px-4 py-4">{children}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-line bg-panel p-4', className)}>{children}</div>
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('animate-spin', className ?? 'h-4 w-4')} />

export function Progress({ percent }: { percent: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
      {percent == null ? <div className="bar-indeterminate h-full w-1/3 bg-accent" /> : <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />}
    </div>
  )
}

/** "i" que abre a explicação ao tocar (no celular não existe passar o mouse) */
export function Tip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={(e) => (e.stopPropagation(), setOpen(!open))} className="inline-flex align-middle text-faint active:text-info">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span className="mt-1.5 block rounded-lg bg-panel-3 px-3 py-2 text-[13px] leading-snug font-normal tracking-normal text-text normal-case" onClick={() => setOpen(false)}>
          {children}
        </span>
      )}
    </>
  )
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-[13px]', active ? 'border-accent/60 bg-accent/15 text-text' : 'border-line bg-panel-2 text-muted')}>
      {children}
    </button>
  )
}
