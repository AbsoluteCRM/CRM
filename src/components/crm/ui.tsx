/**
 * Small UI kit for the CRM screens, styled with the brand tokens in
 * src/styles.css. Kept dependency-free (no Radix) so pages stay light.
 */
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Info,
  Leaf,
  Lock,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react'

import { cn } from '#/lib/utils'
import { initials } from './format'

import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[22px] border border-(--line) bg-(--paper) shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(17,48,31,0.25)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 px-5 pt-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-(--ink)">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-[13px] text-(--ink-3)">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BtnVariant =
  'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'subtle'
type BtnSize = 'sm' | 'md' | 'lg'

const btnVariant: Record<BtnVariant, string> = {
  primary:
    'bg-(--leaf-900) text-(--cream) hover:bg-(--leaf-800) shadow-[0_6px_16px_-8px_rgba(17,48,31,0.6)]',
  accent: 'bg-(--lime) text-(--leaf-950) hover:bg-(--lime-400)',
  outline:
    'border border-(--line-2) bg-(--paper) text-(--ink) hover:bg-(--sage)',
  ghost: 'text-(--ink-2) hover:bg-(--sage) hover:text-(--ink)',
  subtle: 'bg-(--sage) text-(--leaf-800) hover:bg-(--sage-2)',
  danger: 'bg-(--clay-100) text-(--clay) hover:bg-[#f6d6c8]',
}
const btnSize: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
}

const btnBase =
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full font-semibold whitespace-nowrap no-underline transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-(--lime) disabled:pointer-events-none disabled:opacity-45'

/** Button styling for links (avoids nesting a <button> inside an <a>). */
export function btnClass(
  variant: BtnVariant = 'primary',
  size: BtnSize = 'md',
  className?: string,
) {
  return cn(btnBase, btnVariant[variant], btnSize[size], className)
}

export function Btn({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  type = 'button',
  ...props
}: ComponentProps<'button'> & {
  variant?: BtnVariant
  size?: BtnSize
  icon?: LucideIcon
  iconRight?: LucideIcon
}) {
  return (
    <button
      type={type}
      className={cn(btnBase, btnVariant[variant], btnSize[size], className)}
      {...props}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
      {IconRight && (
        <IconRight className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      )}
    </button>
  )
}

export function IconBtn({
  icon: Icon,
  label,
  className,
  tone = 'ghost',
  ...props
}: ComponentProps<'button'> & {
  icon: LucideIcon
  label: string
  tone?: 'ghost' | 'outline' | 'dark'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-(--lime) disabled:opacity-40',
        tone === 'ghost' &&
          'text-(--ink-2) hover:bg-(--sage) hover:text-(--ink)',
        tone === 'outline' &&
          'border border-(--line-2) bg-(--paper) text-(--ink) hover:bg-(--sage)',
        tone === 'dark' &&
          'bg-(--leaf-900) text-(--cream) hover:bg-(--leaf-800)',
        className,
      )}
      {...props}
    >
      <Icon className="size-4" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Badges & avatars
// ---------------------------------------------------------------------------

export type Tone =
  | 'green'
  | 'lime'
  | 'sun'
  | 'clay'
  | 'sky'
  | 'gray'
  | 'violet'
  | 'dark'
  | 'success'
  | 'warning'
  | 'danger'

/**
 * Status colours that mean the same thing in every colour theme, so they use
 * fixed values instead of the themeable --leaf / --lime tokens.
 */
export const FIXED_TONE = {
  success: 'bg-[#dcf0e2] text-[#1d6b3c]',
  warning: 'bg-[#fdf1c7] text-[#8a6100]',
  danger: 'bg-[#fde2df] text-[#b42318]',
} as const

const toneClass: Record<Tone, string> = {
  green: 'bg-(--sage) text-(--leaf-700)',
  lime: 'bg-(--lime-200) text-(--leaf-900)',
  sun: 'bg-(--sun-100) text-(--sun)',
  clay: 'bg-(--clay-100) text-(--clay)',
  sky: 'bg-(--sky-100) text-(--sky)',
  gray: 'bg-(--cream-2) text-(--ink-2)',
  violet: 'bg-(--violet-100) text-(--violet)',
  dark: 'bg-(--leaf-900) text-(--lime)',
  ...FIXED_TONE,
}

export function Badge({
  tone = 'gray',
  dot,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const STATUS: Partial<Record<string, { label: string; tone: Tone }>> = {
  // jobs
  scheduled: { label: 'Scheduled', tone: 'sky' },
  assigned: { label: 'Assigned', tone: 'violet' },
  in_progress: { label: 'In progress', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  // requests
  submitted: { label: 'New', tone: 'lime' },
  reviewing: { label: 'In review', tone: 'sky' },
  estimated: { label: 'Estimate sent', tone: 'violet' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'clay' },
  converted: { label: 'Converted', tone: 'dark' },
  // clients
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'gray' },
  lead: { label: 'Lead', tone: 'lime' },
  invited: { label: 'Invited', tone: 'sky' },
  disabled: { label: 'Disabled', tone: 'gray' },
  // invoices
  draft: { label: 'Draft', tone: 'gray' },
  sent: { label: 'Sent', tone: 'sky' },
  partially_paid: { label: 'Partially paid', tone: 'sun' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Void', tone: 'gray' },
  overdue: { label: 'Overdue', tone: 'clay' },
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const s = STATUS[status] ?? { label: status, tone: 'gray' }
  return (
    <Badge tone={s.tone} dot className={className}>
      {s.label}
    </Badge>
  )
}

export function statusLabel(status: string) {
  return STATUS[status]?.label ?? status
}

export function Avatar({
  name,
  color,
  size = 32,
  className,
  ring,
}: {
  name: string
  color?: string
  size?: number
  className?: string
  ring?: boolean
}) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-(--leaf-950)',
        ring && 'ring-2 ring-(--paper)',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: color ?? 'var(--lime-200)',
      }}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({
  names,
  color,
  max = 4,
  size = 26,
}: {
  names: Array<string>
  color?: string
  max?: number
  size?: number
}) {
  const shown = names.slice(0, max)
  return (
    <div className="flex -space-x-2">
      {shown.map((n) => (
        <Avatar key={n} name={n} color={color} size={size} ring />
      ))}
      {names.length > max && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-(--sage) text-[11px] font-bold text-(--ink-2) ring-2 ring-(--paper)"
          style={{ width: size, height: size }}
        >
          +{names.length - max}
        </span>
      )}
    </div>
  )
}

export function ColorDot({
  color,
  className,
}: {
  color: string
  className?: string
}) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  )
}

// ---------------------------------------------------------------------------
// Navigation controls
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: Array<{ value: T; label: ReactNode; count?: number }>
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex rounded-full border border-(--line) bg-(--paper) p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-4 text-[13px]',
              active
                ? 'bg-(--leaf-900) text-(--cream)'
                : 'text-(--ink-2) hover:text-(--ink)',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] leading-4',
                  active
                    ? 'bg-(--lime) text-(--leaf-950)'
                    : 'bg-(--sage) text-(--ink-2)',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-(--line)',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative -mb-px cursor-pointer border-b-2 px-3 pt-1 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
              active
                ? 'border-(--leaf-700) text-(--ink)'
                : 'border-transparent text-(--ink-3) hover:text-(--ink)',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-(--ink-3)">{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function FilterChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors',
        active
          ? 'border-(--leaf-900) bg-(--leaf-900) text-(--cream)'
          : 'border-(--line-2) bg-(--paper) text-(--ink-2) hover:border-(--leaf-500) hover:text-(--ink)',
      )}
    >
      {color && <ColorDot color={color} />}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const inputBase =
  'w-full rounded-xl border border-(--line-2) bg-(--paper) px-3 text-sm text-(--ink) outline-none transition-shadow placeholder:text-(--ink-3) focus:border-(--leaf-500) focus:ring-[3px] focus:ring-(--lime-200) disabled:opacity-60'

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-semibold text-(--ink-2)"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-(--ink-3)">{hint}</p>}
    </div>
  )
}

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputBase, 'h-10', className)} {...props} />
}

export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(inputBase, 'min-h-24 py-2.5', className)}
      {...props}
    />
  )
}

export function SelectInput({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        className={cn(inputBase, 'h-10 cursor-pointer appearance-none pr-9')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-(--ink-3)" />
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-(--ink-3)" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(inputBase, 'h-10 rounded-full pl-10')}
      />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-(--leaf-600)' : 'bg-(--sage-2)',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export function CheckPill({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked
          ? 'border-(--leaf-600) bg-(--lime-100) text-(--leaf-900)'
          : 'border-(--line-2) bg-(--paper) text-(--ink-2) hover:border-(--leaf-500)',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[5px] border',
          checked
            ? 'border-(--leaf-700) bg-(--leaf-700) text-white'
            : 'border-(--line-2) bg-white',
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path
              d="M2.5 6.2 5 8.5l4.5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEscape(open, onClose)
  const titleId = useId()
  if (!open) return null
  return (
    <div
      className="crm-fade fixed inset-0 z-[60] flex items-end justify-center bg-(--leaf-950)/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="crm-pop flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[26px] bg-(--paper) shadow-2xl sm:rounded-[26px]"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-(--line) px-6 py-5">
          <div>
            <h2
              id={titleId}
              className="crm-display text-xl font-semibold text-(--ink)"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-(--ink-3)">{subtitle}</p>
            )}
          </div>
          <IconBtn icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="crm-scroll flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-(--line) bg-(--cream)/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  header,
  children,
  footer,
  width = 640,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEscape(open, onClose)
  const titleId = useId()
  if (!open) return null
  return (
    <div
      className="crm-fade fixed inset-0 z-[55] flex justify-end bg-(--leaf-950)/35"
      onMouseDown={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="crm-slide flex h-full w-full flex-col bg-(--cream) shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-(--line) bg-(--paper) px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="crm-display truncate text-2xl font-semibold text-(--ink)"
              >
                {title}
              </h2>
              {subtitle && (
                <div className="mt-1 text-sm text-(--ink-3)">{subtitle}</div>
              )}
            </div>
            <IconBtn icon={X} label="Close" onClick={onClose} />
          </div>
          {header}
        </div>
        <div className="crm-scroll flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--line) bg-(--paper) px-6 py-4">
            {footer}
          </div>
        )}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'info' | 'warning'
}
let toasts: Array<ToastItem> = []
const toastListeners = new Set<() => void>()
let toastId = 0

export function toast(message: string, tone: ToastItem['tone'] = 'success') {
  toastId += 1
  const id = toastId
  toasts = [...toasts, { id, message, tone }]
  toastListeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    toastListeners.forEach((l) => l())
  }, 3800)
}

const emptyToasts: Array<ToastItem> = []

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toasts,
    () => emptyToasts,
  )
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-5 bottom-5 z-[80] flex flex-col items-end gap-2"
    >
      {items.map((t) => {
        const Icon =
          t.tone === 'success'
            ? CheckCircle2
            : t.tone === 'warning'
              ? TriangleAlert
              : Info
        return (
          <div
            key={t.id}
            className="crm-pop pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-(--leaf-900) px-4 py-3 text-sm font-medium text-(--cream) shadow-xl"
          >
            <Icon
              className={cn(
                'size-4 shrink-0',
                t.tone === 'warning' ? 'text-(--sun-100)' : 'text-(--lime)',
              )}
            />
            {t.message}
          </div>
        )
      })}
    </div>
  )
}

export function EmptyState({
  icon: Icon = Leaf,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-(--lime-100) text-(--leaf-700)">
        <Icon className="size-6" />
      </div>
      <h3 className="text-base font-bold text-(--ink)">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-(--ink-3)">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Alert({
  tone = 'warning',
  title,
  children,
  action,
  className,
}: {
  tone?: 'warning' | 'info' | 'danger'
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const Icon = tone === 'info' ? Info : TriangleAlert
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3',
        tone === 'warning' && 'border-[#efd9a1] bg-(--sun-100)',
        tone === 'danger' && 'border-[#f0c6b4] bg-(--clay-100)',
        tone === 'info' && 'border-(--sage-2) bg-(--sage)',
        className,
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'warning' && 'text-(--sun)',
          tone === 'danger' && 'text-(--clay)',
          tone === 'info' && 'text-(--leaf-700)',
        )}
      />
      <div className="min-w-0 flex-1 text-sm text-(--ink)">
        <div className="font-semibold">{title}</div>
        {children && <div className="mt-0.5 text-(--ink-2)">{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function NoAccess({ section }: { section: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={Lock}
        title={`${section} is limited to managers`}
        body="Contractors see the jobs assigned to their crew. Switch roles from the header to preview other views."
      />
    </Card>
  )
}

export function Progress({
  value,
  className,
  color,
}: {
  value: number
  className?: string
  color?: string
}) {
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-(--sage)', className)}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color ?? 'var(--leaf-600)',
        }}
      />
    </div>
  )
}

/** Photo tile: real uploads show the image; seeded photos render as a tinted garden placeholder. */
export function PhotoTile({
  url,
  label,
  hue = 100,
  className,
  onRemove,
}: {
  url: string | null
  label: string
  hue?: number
  className?: string
  onRemove?: () => void
}) {
  return (
    <figure
      className={cn(
        'group relative aspect-[4/3] overflow-hidden rounded-2xl bg-(--sage)',
        className,
      )}
    >
      {url ? (
        <img src={url} alt={label} className="size-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 160 120"
          className="size-full"
          role="img"
          aria-label={`${label} (placeholder)`}
        >
          <defs>
            <linearGradient id={`sky-${hue}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={`hsl(${hue + 60} 45% 88%)`} />
              <stop offset="1" stopColor={`hsl(${hue} 40% 80%)`} />
            </linearGradient>
          </defs>
          <rect width="160" height="120" fill={`url(#sky-${hue})`} />
          <circle cx="124" cy="28" r="12" fill={`hsl(${hue + 20} 70% 92%)`} />
          <path
            d="M0 78 Q40 58 80 72 T160 66 V120 H0Z"
            fill={`hsl(${hue} 38% 52%)`}
          />
          <path
            d="M0 92 Q50 76 100 90 T160 86 V120 H0Z"
            fill={`hsl(${hue} 42% 38%)`}
          />
          <circle cx="34" cy="70" r="13" fill={`hsl(${hue + 10} 40% 30%)`} />
          <rect
            x="32"
            y="78"
            width="4"
            height="12"
            fill={`hsl(${hue - 60} 30% 28%)`}
          />
        </svg>
      )}
      <figcaption className="absolute bottom-2 left-2 rounded-full bg-(--leaf-950)/70 px-2 py-0.5 text-[11px] font-semibold text-white">
        {label}
      </figcaption>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="absolute top-2 right-2 hidden size-7 cursor-pointer items-center justify-center rounded-full bg-white/90 text-(--ink) group-hover:flex"
        >
          <X className="size-3.5" />
        </button>
      )}
    </figure>
  )
}

export function KeyValue({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-(--ink)">
        {children || <span className="text-(--ink-3)">—</span>}
      </dd>
    </div>
  )
}

/** Simple controlled-open helper. */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  return {
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    setOpen,
  }
}
