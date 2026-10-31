import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { compact } from '../lib/format'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line bg-panel-2 text-text hover:bg-panel-3',
        variant === 'ghost' && 'text-muted hover:bg-panel-3 hover:text-text',
        variant === 'danger' && 'border border-err/30 bg-err/10 text-err hover:bg-err/20',
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 py-1.5', disabled && 'cursor-not-allowed opacity-45')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-panel-3 ring-1 ring-line'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm leading-5">{label}</span>
        {hint && <span className="block text-xs leading-4 text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function Checkbox({ checked, onChange, className }: { checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className={cx('h-4 w-4 shrink-0 cursor-pointer accent-[#ff4d4d]', className)}
    />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cx(
        'h-9 w-full rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-text outline-none hover:border-[#343b4d] focus:border-info',
        className
      )}
    >
      {children}
    </select>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'h-9 w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-text outline-none placeholder:text-faint hover:border-[#343b4d] focus:border-info',
        className
      )}
    />
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      {children}
      {hint && <div className="text-xs text-faint">{hint}</div>}
    </div>
  )
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-panel-3 text-muted',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'err' && 'bg-err/15 text-err',
        tone === 'info' && 'bg-info/15 text-info',
        className
      )}
    >
      {children}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; disabled?: boolean }[]
}) {
  return (
    <div className="flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-colors disabled:opacity-40',
            value === o.value ? 'bg-panel-3 text-text shadow-sm ring-1 ring-line' : 'text-muted hover:text-text'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs
}: {
  value: T
  onChange: (v: T) => void
  tabs: { id: T; label: string; count?: number | null; hidden?: boolean }[]
}) {
  return (
    <div className="no-scrollbar flex gap-0.5 overflow-x-auto border-b border-line">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm whitespace-nowrap transition-colors',
              value === t.id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
            )}
          >
            {t.label}
            {t.count != null && <span className="rounded bg-panel-3 px-1.5 text-[11px] text-muted">{compact(t.count)}</span>}
          </button>
        ))}
    </div>
  )
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('animate-spin', className ?? 'h-4 w-4')} />

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-muted">
      {icon}
      <div className="text-sm font-medium text-text">{title}</div>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  )
}

export function ProgressBar({ percent, tone = 'accent' }: { percent: number | null; tone?: 'accent' | 'ok' | 'err' | 'info' }) {
  const color = tone === 'ok' ? 'bg-ok' : tone === 'err' ? 'bg-err' : tone === 'info' ? 'bg-info' : 'bg-accent'
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-panel-3">
      {percent == null ? (
        <div className={cx('bar-indeterminate absolute inset-y-0 w-2/5 rounded-full', color)} />
      ) : (
        <div className={cx('h-full rounded-full transition-[width] duration-200', color)} style={{ width: `${percent}%` }} />
      )}
    </div>
  )
}
