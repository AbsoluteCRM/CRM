import { describe, expect, test } from 'vitest'

import { formatAddress, fromGeoapify, isBlank, isComplete } from './address'

describe('fromGeoapify', () => {
  test('splits a street address into boxes', () => {
    expect(
      fromGeoapify({
        address_line1: '120 Crowfoot Way NW',
        housenumber: '120',
        street: 'Crowfoot Way NW',
        city: 'Calgary',
        state: 'Alberta',
        state_code: 'ab',
        postcode: 't3g 2r2',
        country_code: 'ca',
      }),
    ).toEqual({
      line1: '120 Crowfoot Way NW',
      line2: '',
      city: 'Calgary',
      region: 'AB',
      postalCode: 'T3G 2R2',
      country: 'CA',
    })
  })

  test('falls back to address_line1, town and state name', () => {
    expect(
      fromGeoapify({
        address_line1: 'Banff Springs Hotel',
        town: 'Banff',
        state: 'Alberta',
      }),
    ).toMatchObject({
      line1: 'Banff Springs Hotel',
      city: 'Banff',
      region: 'Alberta',
    })
  })
})

describe('formatAddress', () => {
  test('joins the boxes into one line with the country name', () => {
    expect(
      formatAddress({
        line1: '12 Elm St',
        line2: 'Unit 4',
        city: 'Calgary',
        region: 'AB',
        postalCode: 'T2X 1A1',
        country: 'CA',
      }),
    ).toBe('12 Elm St, Unit 4, Calgary, AB T2X 1A1, Canada')
  })

  test('skips blank boxes', () => {
    expect(
      formatAddress({
        line1: ' 1 Main St ',
        line2: ' ',
        city: 'Calgary',
        region: '',
        postalCode: '',
        country: '',
      }),
    ).toBe('1 Main St, Calgary')
  })
})

test('isBlank and isComplete', () => {
  const a = {
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'CA',
  }
  expect(isBlank(a)).toBe(true)
  expect(isComplete({ ...a, line1: '1 Main St' })).toBe(false)
  expect(isComplete({ ...a, line1: '1 Main St', city: 'Calgary' })).toBe(true)
})
