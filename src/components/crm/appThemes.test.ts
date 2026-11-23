import { describe, expect, test } from 'vitest'

import {
  APP_THEMES,
  DEFAULT_APP_THEME,
  mix,
  themeCss,
  themeFor,
  themeVars,
} from './appThemes'

describe('themeFor', () => {
  test('matches a preset by its brand colour, ignoring case', () => {
    expect(themeFor('#245A7A').name).toBe('Lake')
  })

  test('falls back to Forest for missing, invalid or legacy values', () => {
    expect(themeFor(undefined)).toBe(DEFAULT_APP_THEME)
    expect(themeFor('green')).toBe(DEFAULT_APP_THEME)
    expect(themeFor('#11301f')).toBe(DEFAULT_APP_THEME)
  })

  test('derives a darker menu and lighter accent for other colours', () => {
    const t = themeFor('#cc3366')
    expect(t.name).toBe('Custom')
    expect(t.brand).toBe('#cc3366')
    expect(t.menu).toBe(mix('#cc3366', '#000000', 0.6))
    expect(t.accent).toBe(mix('#cc3366', '#ffffff', 0.62))
  })
})

describe('themeVars', () => {
  test('leaves the built-in look alone', () => {
    expect(themeVars(DEFAULT_APP_THEME)).toEqual({})
    expect(themeCss(DEFAULT_APP_THEME)).toBe('')
  })

  test('sets the menu, button and accent tokens', () => {
    const lake = APP_THEMES.find((t) => t.name === 'Lake')!
    const vars = themeVars(lake)
    expect(vars['--leaf-900']).toBe('#0f2a3d')
    expect(vars['--leaf-600']).toBe('#245a7a')
    expect(vars['--lime']).toBe('#8fd8f5')
    expect(themeCss(lake)).toMatch(/^:root\{--leaf-950:#[0-9a-f]{6};/)
  })

  test('every preset name and brand colour is unique', () => {
    expect(new Set(APP_THEMES.map((t) => t.name)).size).toBe(APP_THEMES.length)
    expect(new Set(APP_THEMES.map((t) => t.brand)).size).toBe(APP_THEMES.length)
  })
})

test('mix blends two colours', () => {
  expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
  expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
})
