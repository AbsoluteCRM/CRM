import { cn } from '#/lib/utils'

export function LogoMark({
  size = 36,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      aria-hidden
    >
      <rect width="40" height="40" rx="12" fill="var(--lime)" />
      <path
        d="M11 28c0-9.5 6.8-16 18-17-0.6 11-7.4 17.4-16.6 17.4"
        fill="var(--leaf-900)"
      />
      <path
        d="M11.5 29.5 22 18.5"
        stroke="var(--lime)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({
  className,
  dark = false,
  compact = false,
}: {
  className?: string
  dark?: boolean
  compact?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span
          className={cn(
            'crm-display text-[19px] font-semibold tracking-tight',
            dark ? 'text-(--cream)' : 'text-(--ink)',
          )}
        >
          Absolute
          <span className={dark ? 'text-(--lime)' : 'text-(--leaf-600)'}>
            CRM
          </span>
        </span>
      )}
    </span>
  )
}
