import { useState } from 'react'
import {
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Plus,
  QrCode as QrIcon,
  Save,
  X,
} from 'lucide-react'

import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHeader,
  Field,
  Segmented,
  TextArea,
  TextInput,
  Toggle,
  btnClass,
  toast,
} from '#/components/crm/ui'
import { originSchema } from '#/integrations/settings/schema'
import PortalPaletteCard from './PortalPaletteCard'
import QrCode from './QrCode'
import type {
  EmbedSettings,
  OnlineRequestSettings,
} from '#/integrations/settings/schema'
import type { SettingsPatch } from '#/integrations/settings/settings'

type Content = Pick<
  OnlineRequestSettings,
  | 'tagline'
  | 'mission'
  | 'about'
  | 'show_prices'
  | 'show_hours'
  | 'show_service_areas'
  | 'show_contact'
>

const SHOW_OPTIONS: Array<{ key: keyof Content; label: string; hint: string }> =
  [
    {
      key: 'show_prices',
      label: 'Show service prices',
      hint: 'Off shows “Free estimate” instead of a price.',
    },
    {
      key: 'show_hours',
      label: 'Show business hours',
      hint: 'From the Hours & service areas tab.',
    },
    {
      key: 'show_service_areas',
      label: 'Show service areas',
      hint: 'So visitors can see if you cover them.',
    },
    {
      key: 'show_contact',
      label: 'Show contact details',
      hint: 'Email, phone, and address from the Company profile tab.',
    },
  ]

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} copied`)
  } catch {
    toast(
      `Couldn’t copy. Select the ${what.toLowerCase()} and copy it.`,
      'info',
    )
  }
}

export function embedSnippet({
  embed,
  pageUrl,
  embedUrl,
  orgName,
  brandColor,
}: {
  embed: EmbedSettings
  pageUrl: string
  embedUrl: string
  orgName: string
  brandColor: string
}) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  if (embed.style === 'button') {
    return `<a href="${esc(pageUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${brandColor};color:#fff;font:600 15px/1.2 system-ui,sans-serif;text-decoration:none">${esc(embed.button_label)}</a>`
  }
  return `<iframe src="${esc(embedUrl)}" title="${esc(`Request a service from ${orgName}`)}" width="100%" height="${embed.height}" style="border:0;border-radius:16px;max-width:100%" loading="lazy"></iframe>`
}

/** Origins allowed to frame the inline form; empty means any site. */
function AllowedSites({
  origins,
  disabled,
  onChange,
}: {
  origins: Array<string>
  disabled: boolean
  onChange: (origins: Array<string>) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    const parsed = originSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a website address')
      return
    }
    setError(null)
    setValue('')
    if (!origins.includes(parsed.data)) onChange([...origins, parsed.data])
  }
  return (
    <Field
      label="Websites allowed to show the form"
      htmlFor="embed-site"
      hint={
        error ??
        (origins.length === 0
          ? 'Any website can show it right now. Add your site to lock it down.'
          : 'Only these websites can show the form.')
      }
    >
      {origins.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {origins.map((o) => (
            <li
              key={o}
              className="inline-flex items-center gap-1.5 rounded-full bg-(--sage) py-1 pr-1 pl-3 font-mono text-xs"
            >
              {o}
              <button
                type="button"
                aria-label={`Remove ${o}`}
                disabled={disabled}
                className="cursor-pointer rounded-full p-1 hover:bg-white"
                onClick={() => onChange(origins.filter((x) => x !== o))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <TextInput
          id="embed-site"
          placeholder="https://www.yourcompany.com"
          value={value}
          disabled={disabled || origins.length >= 20}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Btn
          variant="outline"
          icon={Plus}
          disabled={disabled || !value.trim()}
          onClick={add}
        >
          Add
        </Btn>
      </div>
    </Field>
  )
}

export default function OnlineRequestsSettings({
  orgName,
  slug,
  brandColor,
  settings,
  pageUrl,
  embedUrl,
  onSave,
  saving,
}: {
  orgName: string
  slug: string
  brandColor: string
  settings: OnlineRequestSettings
  pageUrl: string
  embedUrl: string
  /** Resolves false when the save failed (the error toast is already shown). */
  onSave: (
    patch: NonNullable<SettingsPatch['online_requests']>,
  ) => Promise<boolean>
  saving: boolean
}) {
  const initial: Content = {
    tagline: settings.tagline,
    mission: settings.mission,
    about: settings.about,
    show_prices: settings.show_prices,
    show_hours: settings.show_hours,
    show_service_areas: settings.show_service_areas,
    show_contact: settings.show_contact,
  }
  const [draft, setDraft] = useState<Content>(initial)
  const dirty = (Object.keys(initial) as Array<keyof Content>).some(
    (k) => (draft[k] ?? '') !== (initial[k] ?? ''),
  )
  const set = <TKey extends keyof Content>(key: TKey, value: Content[TKey]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const [embedDraft, setEmbedDraft] = useState(settings.embed)
  const saveEmbed = (patch: Partial<EmbedSettings>) => {
    setEmbedDraft((e) => ({ ...e, ...patch }))
    void onSave({ embed: patch }).then((ok) => {
      if (ok) toast('Embed settings saved')
      else setEmbedDraft(settings.embed)
    })
  }
  const snippet = embedSnippet({
    embed: embedDraft,
    pageUrl,
    embedUrl,
    orgName,
    brandColor,
  })

  const saveContent = async () => {
    if (await onSave(draft)) toast('Request page updated')
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Globe className="size-4 text-(--leaf-600)" /> Public request
                page
                {settings.enabled ? (
                  <Badge tone="green" dot>
                    Accepting requests
                  </Badge>
                ) : (
                  <Badge tone="gray" dot>
                    Paused
                  </Badge>
                )}
              </p>
              <p className="mt-1 max-w-xl text-[13px] text-(--ink-2)">
                Customers pick a service and send you a request without an
                account. New requests appear on the Requests page for your team
                to estimate.
              </p>
            </div>
            <Toggle
              checked={settings.enabled}
              disabled={saving}
              label="Accept online requests"
              onChange={(v) =>
                void onSave({ enabled: v }).then(
                  (ok) =>
                    ok &&
                    toast(
                      v
                        ? 'Online requests turned on'
                        : 'Online requests paused',
                      'info',
                    ),
                )
              }
            />
          </div>
          {!settings.enabled && (
            <Alert tone="info" className="mt-4" title="Requests are paused">
              The page still shows your contact details, but the form and
              services are hidden and new submissions are refused.
            </Alert>
          )}
          <Field label="Your link" className="mt-4" htmlFor="portal-link">
            <div className="flex flex-wrap gap-2">
              <TextInput
                id="portal-link"
                readOnly
                value={pageUrl}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 font-mono text-[13px]"
              />
              <Btn
                variant="outline"
                icon={Copy}
                onClick={() => void copy(pageUrl, 'Link')}
              >
                Copy
              </Btn>
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener"
                className={btnClass('outline')}
              >
                <ExternalLink className="size-4" /> Open
              </a>
            </div>
          </Field>
          <p className="mt-2 text-xs text-(--ink-3)">
            <Link2 className="mr-1 inline size-3.5 align-[-2px]" /> Add it to
            your Google Business Profile, social bios, and email signature. The
            link uses your workspace slug, <code>{slug}</code>.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Page content"
            subtitle="What visitors see above your services."
          />
          <div className="grid gap-4 p-5">
            <Field
              label="Tagline"
              htmlFor="portal-tagline"
              hint="One line under your company name."
            >
              <TextInput
                id="portal-tagline"
                maxLength={140}
                placeholder="Lawn care and landscaping across Calgary"
                value={draft.tagline ?? ''}
                onChange={(e) => set('tagline', e.target.value)}
              />
            </Field>
            <Field label="Our mission" htmlFor="portal-mission">
              <TextArea
                id="portal-mission"
                maxLength={600}
                placeholder="Why your company does what it does."
                value={draft.mission ?? ''}
                onChange={(e) => set('mission', e.target.value)}
              />
            </Field>
            <Field
              label="About us"
              htmlFor="portal-about"
              hint="Experience, guarantees, insurance, anything that builds trust."
            >
              <TextArea
                id="portal-about"
                maxLength={2000}
                rows={4}
                value={draft.about ?? ''}
                onChange={(e) => set('about', e.target.value)}
              />
            </Field>
            <div className="divide-y divide-(--line) rounded-2xl border border-(--line)">
              {SHOW_OPTIONS.map((o) => (
                <div
                  key={o.key}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {o.label}
                    </span>
                    <span className="text-xs text-(--ink-3)">{o.hint}</span>
                  </span>
                  <Toggle
                    checked={draft[o.key] as boolean}
                    label={o.label}
                    onChange={(v) => set(o.key, v)}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Btn
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => setDraft(initial)}
              >
                Discard
              </Btn>
              <Btn
                icon={Save}
                disabled={!dirty || saving}
                onClick={() => void saveContent()}
              >
                Save page
              </Btn>
            </div>
          </div>
        </Card>

        <PortalPaletteCard
          palette={settings.palette}
          saving={saving}
          onSave={async (palette) => {
            const ok = await onSave({ palette })
            if (ok) toast('Page colours saved')
            return ok
          }}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <QrIcon className="size-4 text-(--leaf-600)" /> QR code
              </span>
            }
            subtitle="For trucks, yard signs, flyers, and invoices."
          />
          <div className="p-5">
            <QrCode value={pageUrl} fileName={`${slug}-request-qr`} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Code2 className="size-4 text-(--leaf-600)" /> Embed on your
                website
              </span>
            }
            subtitle="Paste the snippet into your site’s HTML."
            action={
              <Toggle
                checked={embedDraft.enabled}
                disabled={saving}
                label="Allow embedding"
                onChange={(v) => saveEmbed({ enabled: v })}
              />
            }
          />
          <div className="grid gap-4 p-5">
            {!embedDraft.enabled && (
              <Alert tone="info" title="Embedding is off">
                Other websites can’t show your form. Your link and QR code still
                work.
              </Alert>
            )}
            <Field label="Style">
              <Segmented
                value={embedDraft.style}
                onChange={(v) => saveEmbed({ style: v })}
                options={[
                  { value: 'inline', label: 'Inline form' },
                  { value: 'button', label: 'Button' },
                ]}
              />
            </Field>
            {embedDraft.style === 'inline' ? (
              <>
                <Field
                  label="Height (px)"
                  htmlFor="embed-height"
                  hint="400–2000. Taller shows more services without scrolling."
                >
                  <TextInput
                    id="embed-height"
                    type="number"
                    min={400}
                    max={2000}
                    step={50}
                    key={`h-${settings.embed.height}`}
                    defaultValue={embedDraft.height}
                    onBlur={(e) => {
                      const n = Math.round(Number(e.target.value))
                      if (n >= 400 && n <= 2000 && n !== embedDraft.height)
                        saveEmbed({ height: n })
                      else e.target.value = String(embedDraft.height)
                    }}
                  />
                </Field>
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold">
                      Compact layout
                    </span>
                    <span className="text-xs text-(--ink-3)">
                      Only services and the form, no intro.
                    </span>
                  </span>
                  <Toggle
                    checked={embedDraft.compact}
                    label="Compact layout"
                    onChange={(v) => saveEmbed({ compact: v })}
                  />
                </label>
              </>
            ) : (
              <Field label="Button text" htmlFor="embed-label">
                <TextInput
                  id="embed-label"
                  maxLength={40}
                  key={`l-${settings.embed.button_label}`}
                  defaultValue={embedDraft.button_label}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== embedDraft.button_label)
                      saveEmbed({ button_label: v })
                    else e.target.value = embedDraft.button_label
                  }}
                />
              </Field>
            )}
            {embedDraft.style === 'inline' && (
              <AllowedSites
                origins={embedDraft.allowed_origins}
                disabled={saving || !embedDraft.enabled}
                onChange={(allowed_origins) => saveEmbed({ allowed_origins })}
              />
            )}
            <Field label="Snippet" htmlFor="embed-snippet">
              <TextArea
                id="embed-snippet"
                readOnly
                rows={4}
                value={snippet}
                onFocus={(e) => e.target.select()}
                className="font-mono text-xs"
              />
            </Field>
            <div className="flex justify-end">
              <Btn
                variant="outline"
                icon={Copy}
                onClick={() => void copy(snippet, 'Snippet')}
              >
                Copy snippet
              </Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
