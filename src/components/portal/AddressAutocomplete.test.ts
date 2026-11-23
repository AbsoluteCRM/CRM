import { describe, expect, test } from 'vitest'

import { formatAddress, toAddressParts } from './AddressAutocomplete'

describe('toAddressParts', () => {
  test('splits a Geoapify street address into boxes', () => {
    expect(
      toAddressParts({
        address_line1: '120 Crowfoot Way NW',
        housenumber: '120',
        street: 'Crowfoot Way NW',
        city: 'Calgary',
        state: 'Alberta',
        state_code: 'ab',
        postcode: 't3g 2r2',
        country: 'Canada',
        country_code: 'ca',
        lat: 51.12,
        lon: -114.2,
      }),
    ).toEqual({
      line1: '120 Crowfoot Way NW',
      line2: '',
      city: 'Calgary',
      region: 'AB',
      postalCode: 'T3G 2R2',
      country: 'Canada',
      countryCode: 'CA',
      latitude: 51.12,
      longitude: -114.2,
    })
  })

  test('falls back to address_line1, town and state name', () => {
    expect(
      toAddressParts({
        address_line1: 'Banff Springs Hotel',
        town: 'Banff',
        state: 'Alberta',
        country: 'Canada',
      }),
    ).toMatchObject({
      line1: 'Banff Springs Hotel',
      city: 'Banff',
      region: 'Alberta',
    })
  })
})

describe('formatAddress', () => {
  test('joins the boxes into one line', () => {
    expect(
      formatAddress({
        line1: '12 Elm St',
        line2: 'Unit 4',
        city: 'Calgary',
        region: 'AB',
        postalCode: 'T2X 1A1',
        country: 'Canada',
        countryCode: 'CA',
      }),
    ).toBe('12 Elm St, Unit 4, Calgary, AB T2X 1A1, Canada')
  })

  test('skips empty and blank boxes', () => {
    expect(
      formatAddress({
        line1: ' 1 Main St ',
        line2: '  ',
        city: 'Calgary',
        region: '',
        postalCode: '',
        country: '',
        countryCode: '',
      }),
    ).toBe('1 Main St, Calgary')
  })
})
