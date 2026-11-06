import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Btn } from '#/components/crm/ui'
import { toast } from '#/lib/toast'
import { validateLogoFile } from '#/integrations/settings/logo'

type Props = {
  name: string
  logoUrl: string | null
  hasLogo: boolean
  brand: string
  upload: (file: File) => Promise<boolean>
  remove: () => Promise<boolean>
}

export default function CompanyLogo({
  name,
  logoUrl,
  hasLogo,
  brand,
  upload,
  remove,
}: Props) {
  const file = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [broken, setBroken] = useState<string | null>(null)
  const showImage = logoUrl && broken !== logoUrl
  const run = async (selected?: File) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      if (selected) validateLogoFile(selected)
      const current = await (selected ? upload(selected) : remove())
      if (current) toast(selected ? 'Logo updated' : 'Logo removed', 'info')
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Couldn’t update the logo. Please try again.',
      )
    } finally {
      running.current = false
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl bg-(--cream) p-6"
      aria-busy={busy}
    >
      <span
        className="flex size-24 items-center justify-center overflow-hidden rounded-3xl text-4xl font-bold text-white shadow-md"
        style={{ background: showImage ? '#fff' : brand }}
      >
        {showImage ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className="size-full object-contain"
            onError={() => setBroken(logoUrl)}
          />
        ) : (
          name.charAt(0)
        )}
      </span>
      <div className="flex gap-2">
        <Btn
          variant="outline"
          size="sm"
          icon={Upload}
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          {busy ? 'Updating…' : 'Upload logo'}
        </Btn>
        {hasLogo && (
          <Btn
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void run()}
          >
            Remove
          </Btn>
        )}
      </div>
      <p className="text-center text-xs text-(--ink-3)">
        PNG, JPG, or WebP, up to 10 MiB.
      </p>
      {busy && (
        <p role="status" className="text-xs">
          Updating company logo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <input
        ref={file}
        aria-label="Company logo file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        disabled={busy}
        onChange={(e) => {
          const selected = e.target.files?.[0]
          if (selected) void run(selected)
        }}
      />
    </div>
  )
}
