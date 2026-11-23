/**
 * Colour themes for the signed-in app. A company's `brand_color` picks one:
 * it matches a preset's `brand`, or any other colour gets a theme derived
 * from it. Themes override the --leaf-* (greens), --lime-* (accent) and
 * --sage* (light tint) tokens from src/styles.css.
 */

export type AppTheme = {
  name: string
  /** Buttons, links and icons (--leaf-600). Saved as `brand_color`. */
  brand: string
  /** The side menu and primary buttons (--leaf-900). */
  menu: string
  /** Highlights: the active menu item, charts, badges (--lime). */
  accent: string
}

/** Forest is the CRM's built-in look; picking it leaves the tokens alone. */
export const APP_THEMES: Array<AppTheme> = [
  { name: 'Forest', brand: '#2f7350', menu: '#11301f', accent: '#c6ef6a' },
  { name: 'Lake', brand: '#245a7a', menu: '#0f2a3d', accent: '#8fd8f5' },
  { name: 'Cedar', brand: '#7a4a24', menu: '#2e1a0d', accent: '#f2c46b' },
  { name: 'Plum', brand: '#5b3f8c', menu: '#23163a', accent: '#d6bcff' },
  { name: 'Berry', brand: '#8c3f4f', menu: '#34141c', accent: '#ffb8a6' },
  { name: 'Harbour', brand: '#3f6b8c', menu: '#182a38', accent: '#a6e6d3' },
]

export const DEFAULT_APP_THEME = APP_THEMES[0]

const CREAM = '#f4f2ea'

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `a` blended toward `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`
}

const isHex = (v: string | undefined): v is string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/** The theme for a stored brand colour. */
export function themeFor(brand: string | undefined): AppTheme {
  if (!isHex(brand)) return DEFAULT_APP_THEME
  const b = brand.toLowerCase()
  // #11301f was the darkest swatch before themes existed; it is Forest's menu.
  if (b === '#11301f') return DEFAULT_APP_THEME
  const preset = APP_THEMES.find((t) => t.brand === b)
  if (preset) return preset
  return {
    name: 'Custom',
    brand: b,
    menu: mix(b, '#000000', 0.6),
    accent: mix(b, '#ffffff', 0.62),
  }
}

/** CSS custom properties for a theme; empty for the built-in Forest look. */
export function themeVars(theme: AppTheme): Record<string, string> {
  if (theme.name === DEFAULT_APP_THEME.name) return {}
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

/** A `:root { … }` block for the theme, or '' for Forest. */
export function themeCss(theme: AppTheme) {
  const vars = Object.entries(themeVars(theme))
  if (vars.length === 0) return ''
  return `:root{${vars.map(([k, v]) => `${k}:${v};`).join('')}}`
}
