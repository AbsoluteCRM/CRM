import { expect, test } from 'vitest'
import { fmtPhone } from './format'

test('fmtPhone adds brackets to North American numbers', () => {
  expect(fmtPhone('403-555-0142')).toBe('(403) 555-0142')
  expect(fmtPhone('4035550142')).toBe('(403) 555-0142')
  expect(fmtPhone('+1 403.555.0142')).toBe('+1 (403) 555-0142')
  expect(fmtPhone('555-0142')).toBe('555-0142')
  expect(fmtPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
})
