import { useEffect } from 'react'

import { themeCss, themeFor } from '#/components/crm/appThemes'
import { useCompanySettings } from '#/integrations/settings/settings'

const STORAGE_KEY = 'absolutecrm:brand-color'

function remembered() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * The active company's colour theme (Settings → Company profile). Until the
 * settings load, the last theme this browser saw is used, so pages don't
 * flash green first.
 */
export function useAppTheme() {
  const company = useCompanySettings()
  const brand =
    company.data?.settings.brand_color ??
    (typeof window === 'undefined' ? undefined : remembered())
  return themeFor(brand)
}

/** Recolours the signed-in app. Rendered by the header on every page. */
export default function AppThemeStyles() {
  const company = useCompanySettings()
  const theme = useAppTheme()
  const saved = company.data?.settings.brand_color

  useEffect(() => {
    if (!saved) return
    try {
      window.localStorage.setItem(STORAGE_KEY, saved)
    } catch {
      // Private mode or storage off: the theme still applies once loaded.
    }
  }, [saved])

  const css = themeCss(theme)
  return css ? <style>{css}</style> : null
}
