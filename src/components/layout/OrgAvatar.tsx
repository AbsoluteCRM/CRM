import { cn } from '#/lib/utils'
import { useCompanySettings } from '#/integrations/settings/settings'

/**
 * The active company's logo, or its first letter on its brand color, from
 * Settings → Company profile. Falls back to the letter while loading and for
 * roles that can't read the logo file.
 */
export default function OrgAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const company = useCompanySettings()
  const logo = company.data?.logo_url
  const brand = company.data?.settings.brand_color ?? 'var(--leaf-700)'
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-bold text-white',
        className,
      )}
      style={{ background: logo ? '#fff' : brand }}
    >
      {logo ? (
        <img src={logo} alt="" className="size-full object-contain" />
      ) : (
        name.charAt(0)
      )}
    </span>
  )
}
