import { expect, test } from 'vitest'

import { PALETTE_PRESETS, samePalette, textOn } from './palettes'

test('textOn picks readable text', () => {
  expect(textOn('#11301f')).toBe('#ffffff')
  expect(textOn('#c6ef6a')).toBe('#13241a')
  expect(textOn('#e7ecdf')).toBe('#13241a')
})

test('every preset has white text on primary and dark text on secondary', () => {
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
