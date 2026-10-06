import { Link, createFileRoute } from '@tanstack/react-router'
import {
  CalendarDays,
  ClipboardCheck,
  Users,
  ArrowRight,
  Leaf,
} from 'lucide-react'

import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="min-h-svh">
      {/* Navigation */}
      <nav className="page-wrap flex items-center justify-between py-6">
        <Link
          to="/"
          className="flex items-center gap-2 no-underline"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--palm)] text-white">
            <Leaf size={19} />
          </div>

          <span className="text-lg font-extrabold tracking-tight text-[var(--sea-ink)]">
            ABSOLUTE CRM
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>

          <Button
            asChild
            className="bg-[var(--palm)] text-white hover:bg-[var(--palm)]/90"
          >
            <Link to="/sign-up">
              Get started
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="page-wrap rise-in flex flex-col items-center px-4 pb-20 pt-24 text-center sm:pt-32">
        <div className="island-kicker mb-5">
          Built for landscaping & contractor teams
        </div>

        <h1 className="display-title max-w-4xl text-5xl leading-[1.05] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl lg:text-7xl">
          Run your business.
          <br />
          <span className="text-[var(--palm)]">
            We'll handle the busywork.
          </span>
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--sea-ink-soft)]">
          Keep your clients, jobs, crews, and schedule organized in one place.
          Absolute CRM gives your team the tools to spend less time managing
          paperwork and more time getting work done.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            asChild
            className="bg-[var(--palm)] text-white hover:bg-[var(--palm)]/90"
          >
            <Link to="/sign-up">
              Get started
              <ArrowRight />
            </Link>
          </Button>

          <Button size="lg" variant="outline" asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="page-wrap pb-24">
        <div className="grid gap-5 md:grid-cols-3">
          <FeatureCard
            icon={<Users />}
            title="Manage clients"
            description="Keep customer information and important details organized and easy to find."
          />

          <FeatureCard
            icon={<CalendarDays />}
            title="Plan your schedule"
            description="Keep track of upcoming work and help your team stay on top of the day."
          />

          <FeatureCard
            icon={<ClipboardCheck />}
            title="Track every job"
            description="Manage jobs from the first request through completion without losing the details."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="page-wrap pb-24">
        <div className="island-shell rounded-3xl px-6 py-12 text-center sm:px-12">
          <p className="island-kicker mb-3">One place. Your whole operation.</p>

          <h2 className="display-title text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
            Ready to simplify the workday?
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-[var(--sea-ink-soft)]">
            Bring your customers, jobs, and team together with Absolute CRM.
          </p>

          <Button
            size="lg"
            asChild
            className="mt-7 bg-[var(--palm)] text-white hover:bg-[var(--palm)]/90"
          >
            <Link to="/sign-up">
              Create an account
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="page-wrap flex flex-col items-center justify-between gap-3 py-6 text-sm text-[var(--sea-ink-soft)] sm:flex-row">
          <div className="flex items-center gap-2 font-semibold text-[var(--sea-ink)]">
            <Leaf size={16} />
            ABSOLUTE CRM
          </div>

          <p>Built for teams that keep things moving.</p>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="feature-card rounded-2xl border border-[var(--line)] p-7">
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-[var(--sand)] text-[var(--palm)]">
        {icon}
      </div>

      <h2 className="text-lg font-bold text-[var(--sea-ink)]">{title}</h2>

      <p className="mt-2 leading-7 text-[var(--sea-ink-soft)]">
        {description}
      </p>
    </div>
  )
}
