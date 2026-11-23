import { DEFAULT_PALETTE } from '#/integrations/settings/schema'
import type { PortalPalette } from '#/integrations/settings/schema'

const DARK_TEXT = '#13241a'
const CREAM = '#f4f2ea'

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `a` blended toward `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number) {
  const ca = rgb(a)
  const cb = rgb(b)
  return `#${ca
    .map((x, i) =>
      Math.round(x + (cb[i] - x) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Dark or white text, whichever reads better on `background`. */
export function textOn(background: string) {
  const bg = luminance(background)
  return contrast(bg, luminance(DARK_TEXT)) >= contrast(bg, 1)
    ? DARK_TEXT
    : '#ffffff'
}

// ---------------------------------------------------------------------------
// App themes (Settings → Company profile). `brand_color` picks one.
// ---------------------------------------------------------------------------

export type AppTheme = {
  name: string
  /** Buttons, links, icons (--leaf-600). Saved as `brand_color`. */
  brand: string
  /** Side menu and primary buttons (--leaf-900). */
  menu: string
  /** Active menu item, charts, badges (--lime). */
  accent: string
}

export const APP_THEMES: Array<AppTheme> = [
  { name: 'Forest', brand: '#2f7350', menu: '#11301f', accent: '#c6ef6a' },
  { name: 'Lake', brand: '#245a7a', menu: '#0f2a3d', accent: '#8fd8f5' },
  { name: 'Cedar', brand: '#7a4a24', menu: '#2e1a0d', accent: '#f2c46b' },
  { name: 'Plum', brand: '#5b3f8c', menu: '#23163a', accent: '#d6bcff' },
  { name: 'Berry', brand: '#8c3f4f', menu: '#34141c', accent: '#ffb8a6' },
  { name: 'Harbour', brand: '#3f6b8c', menu: '#182a38', accent: '#a6e6d3' },
]

const FOREST = APP_THEMES[0]

export function themeFor(brand: string | undefined): AppTheme {
  if (!brand || !/^#[0-9a-f]{6}$/i.test(brand)) return FOREST
  const b = brand.toLowerCase()
  // #11301f was a brand swatch before themes existed.
  if (b === '#11301f') return FOREST
  return (
    APP_THEMES.find((t) => t.brand === b) ?? {
      name: 'Custom',
      brand: b,
      menu: mix(b, '#000000', 0.6),
      accent: mix(b, '#ffffff', 0.62),
    }
  )
}

/** Token overrides for a theme; empty for Forest, the built-in look. */
export function themeVars(theme: AppTheme): Record<string, string> {
  if (theme.name === FOREST.name) return {}
  const { brand, menu, accent } = theme
  return {
    '--leaf-950': mix(menu, '#000000', 0.4),
    '--leaf-900': menu,
    '--leaf-800': mix(menu, brand, 0.25),
    '--leaf-700': mix(menu, brand, 0.6),
    '--leaf-600': brand,
    '--leaf-500': mix(brand, '#ffffff', 0.15),
    '--leaf-300': mix(brand, '#ffffff', 0.55),
    '--lime': accent,
    '--lime-400': mix(accent, '#000000', 0.08),
    '--lime-200': mix(accent, '#ffffff', 0.5),
    '--lime-100': mix(accent, '#ffffff', 0.75),
    '--sage': mix(CREAM, brand, 0.09),
    '--sage-2': mix(CREAM, brand, 0.18),
  }
}

export function themeCss(theme: AppTheme) {
  const vars = Object.entries(themeVars(theme))
  return vars.length
    ? `:root{${vars.map(([k, v]) => `${k}:${v};`).join('')}}`
    : ''
}

// ---------------------------------------------------------------------------
// Public request page palettes (Settings → Online requests).
// ---------------------------------------------------------------------------

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
  (['primary', 'secondary', 'accent'] as const).every(
    (k) => a[k].toLowerCase() === b[k].toLowerCase(),
  )
