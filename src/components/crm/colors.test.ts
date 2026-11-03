import { describe, expect, test } from 'vitest'

import {
  APP_THEMES,
  PALETTE_PRESETS,
  mix,
  samePalette,
  textOn,
  themeCss,
  themeFor,
  themeVars,
} from './colors'

test('mix blends two colours', () => {
  expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
  expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
})

test('textOn picks readable text', () => {
  expect(textOn('#11301f')).toBe('#ffffff')
  expect(textOn('#c6ef6a')).toBe('#13241a')
})

describe('app themes', () => {
  test('themeFor matches presets, ignoring case', () => {
    expect(themeFor('#245A7A').name).toBe('Lake')
  })

  test('themeFor falls back to Forest for missing, invalid or legacy values', () => {
    for (const v of [undefined, 'green', '#11301f'])
      expect(themeFor(v).name).toBe('Forest')
  })

  test('themeFor derives a custom theme from any other colour', () => {
    expect(themeFor('#cc3366')).toEqual({
      name: 'Custom',
      brand: '#cc3366',
      menu: mix('#cc3366', '#000000', 0.6),
      accent: mix('#cc3366', '#ffffff', 0.62),
    })
  })

  test('Forest leaves the tokens alone', () => {
    expect(themeVars(APP_THEMES[0])).toEqual({})
    expect(themeCss(APP_THEMES[0])).toBe('')
  })

  test('other themes set menu, button and accent tokens', () => {
    const vars = themeVars(themeFor('#245a7a'))
    expect(vars).toMatchObject({
      '--leaf-900': '#0f2a3d',
      '--leaf-600': '#245a7a',
      '--lime': '#8fd8f5',
    })
  })
})

describe('request page palettes', () => {
  test('every preset reads well: white on primary, dark on the others', () => {
    for (const { palette } of PALETTE_PRESETS) {
      expect(textOn(palette.primary)).toBe('#ffffff')
      expect(textOn(palette.secondary)).toBe('#13241a')
      expect(textOn(palette.accent)).toBe('#13241a')
    }
  })

  test('samePalette ignores letter case', () => {
    expect(
      samePalette(
        { primary: '#AABBCC', secondary: '#000000', accent: '#ffffff' },
        { primary: '#aabbcc', secondary: '#000000', accent: '#FFFFFF' },
      ),
    ).toBe(true)
  })
})
