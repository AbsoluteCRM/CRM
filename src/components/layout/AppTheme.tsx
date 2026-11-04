import { useEffect } from 'react'

import { themeCss, themeFor } from '#/components/crm/colors'
import { useCompanySettings } from '#/integrations/settings/settings'

const STORAGE_KEY = 'absolutecrm:brand-color'

function remembered() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** Falls back to the last theme this browser saw while settings load. */
export function useAppTheme() {
  const company = useCompanySettings()
  const brand =
    company.data?.settings.brand_color ??
    (typeof window === 'undefined' ? undefined : remembered())
  return themeFor(brand)
}

export default function AppThemeStyles() {
  const company = useCompanySettings()
  const theme = useAppTheme()
  const saved = company.data?.settings.brand_color

  useEffect(() => {
    if (!saved) return
    try {
      window.localStorage.setItem(STORAGE_KEY, saved)
    } catch {
      // Storage blocked: the theme still applies once settings load.
    }
  }, [saved])

  const css = themeCss(theme)
  return css ? <style>{css}</style> : null
}
