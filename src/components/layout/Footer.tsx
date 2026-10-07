/**
 * The authed layout renders <Footer /> below a full-height <main>, which would
 * push the page past the viewport. Each page renders <AppFooter /> at the end of
 * its own scroll area instead (see PageShell), so the layout-level footer is
 * intentionally empty. Safe to remove from `_authed.tsx` later.
 */
export default function Footer() {
  return null
}

export function AppFooter() {
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-(--line) pt-5 text-xs text-(--ink-3)">
      <p>
        © {new Date().getFullYear()} AbsoluteCRM · Built for landscaping teams
      </p>
      <p className="flex gap-4">
        <a
          href="mailto:support@absolutecrm.app"
          className="text-(--ink-3) no-underline hover:text-(--ink)"
        >
          Support
        </a>
        <span>Data is isolated per company</span>
      </p>
    </footer>
  )
}
