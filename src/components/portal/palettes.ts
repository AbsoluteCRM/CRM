import { DEFAULT_PALETTE } from '#/integrations/settings/schema'
import type { PortalPalette } from '#/integrations/settings/schema'

/** Ready-made request page palettes. Forest matches the CRM's own menu bar. */
export const PALETTE_PRESETS: Array<{ name: string; palette: PortalPalette }> =
  [
    { name: 'Forest', palette: DEFAULT_PALETTE },
    {
      name: 'Lakeside',
      palette: { primary: '#15324a', secondary: '#e2ebf1', accent: '#8fd0f0' },
    },
    {
      name: 'Clay',
      palette: { primary: '#3a2418', secondary: '#f1e7dc', accent: '#e8a456' },
    },
    {
      name: 'Slate',
      palette: { primary: '#1e2a32', secondary: '#e6e9ec', accent: '#9ed9c5' },
    },
    {
      name: 'Harvest',
      palette: { primary: '#2e3a12', secondary: '#eef0dc', accent: '#f2c641' },
    },
  ]

export const samePalette = (a: PortalPalette, b: PortalPalette) =>
  a.primary.toLowerCase() === b.primary.toLowerCase() &&
  a.secondary.toLowerCase() === b.secondary.toLowerCase() &&
  a.accent.toLowerCase() === b.accent.toLowerCase()

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex: string) {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

const DARK_TEXT = '#13241a'

/** Dark or white text, whichever reads better on `background`. */
export function textOn(background: string) {
  const bg = luminance(background)
  return contrast(bg, luminance(DARK_TEXT)) >= contrast(bg, 1)
    ? DARK_TEXT
    : '#ffffff'
}
