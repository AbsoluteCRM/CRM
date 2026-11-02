import { LogoMark } from '#/components/crm/Logo'
import { cn } from '#/lib/utils'

/**
 * Full-screen loading state. Covers the page with one solid colour so the
 * body's decorative gradient never shows through while data loads.
 * `plain` hides the AbsoluteCRM mark (public pages show a company's own brand).
 */
export default function PageLoading({
  label = 'Loading',
  plain = false,
  className,
}: {
  label?: string
  plain?: boolean
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#f7f6f2]',
        className,
      )}
    >
      {!plain && <LogoMark size={44} className="animate-pulse" />}
      <span
        aria-hidden
        className="relative block h-0.5 w-28 overflow-hidden rounded-full bg-(--ink)/10"
      >
        <span className="crm-loading-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-(--leaf-600)" />
      </span>
      <span className="sr-only">{label}…</span>
      <style>{`
        .crm-loading-bar { animation: crm-loading 1.1s ease-in-out infinite; }
        @keyframes crm-loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .crm-loading-bar { animation: none; width: 100%; opacity: .5; }
        }
      `}</style>
    </div>
  )
}
