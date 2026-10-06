import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bell, Building2, Palette, UserRound } from 'lucide-react'

import { useAuth } from '#/integrations/auth/context'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { user } = useAuth()

  const [jobNotifications, setJobNotifications] = useState(true)
  const [requestNotifications, setRequestNotifications] = useState(true)
  const [teamNotifications, setTeamNotifications] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <p className="island-kicker mb-2">Workspace</p>
          <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)]">
            Settings
          </h1>
          <p className="mt-2 text-[var(--sea-ink-soft)]">
            Manage your account and workspace preferences.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <SettingsSection
            icon={UserRound}
            title="Account"
            description="Your personal account information."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Your name" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                />
              </div>
            </div>

            <div className="mt-5">
              <Button>Save account</Button>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Building2}
            title="Business"
            description="Information about your company."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="business-name">Business name</Label>
                <Input
                  id="business-name"
                  placeholder="Absolute Landscaping"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" placeholder="(403) 555-0123" />
              </div>
            </div>

            <div className="mt-5">
              <Button>Save business</Button>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Bell}
            title="Notifications"
            description="Choose which updates you want to receive."
          >
            <div className="divide-y divide-[var(--line)]">
              <NotificationSetting
                title="Job updates"
                description="Receive updates when jobs change."
                checked={jobNotifications}
                onCheckedChange={setJobNotifications}
              />

              <NotificationSetting
                title="New requests"
                description="Receive updates when a new customer request arrives."
                checked={requestNotifications}
                onCheckedChange={setRequestNotifications}
              />

              <NotificationSetting
                title="Team updates"
                description="Receive updates about changes to your team."
                checked={teamNotifications}
                onCheckedChange={setTeamNotifications}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Palette}
            title="Appearance"
            description="Customize how Absolute CRM looks."
          >
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="font-semibold text-[var(--sea-ink)]">
                  Dark mode
                </p>
                <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
                  Use the darker Absolute CRM theme.
                </p>
              </div>

              <Switch disabled />
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="island-shell rounded-2xl p-6">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sand)] text-[var(--palm)]">
          <Icon size={20} />
        </div>

        <div>
          <h2 className="text-lg font-bold text-[var(--sea-ink)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
            {description}
          </p>
        </div>
      </div>

      {children}
    </section>
  )
}

function NotificationSetting({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="font-semibold text-[var(--sea-ink)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
          {description}
        </p>
      </div>

      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
