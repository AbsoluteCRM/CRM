import { describe, expect, it } from 'vitest'

import { OSM_ATTRIBUTION, resolveBasemap } from './providers'

describe('resolveBasemap', () => {
  it('defaults to OpenStreetMap in dev when nothing is set', () => {
    const { basemap } = resolveBasemap({ dev: true })
    expect(basemap).toMatchObject({
      kind: 'xyz',
      provider: 'osm',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    })
  })

  it('shows no basemap in production when nothing is set', () => {
    const { basemap, notice } = resolveBasemap({ dev: false })
    expect(basemap).toBeNull()
    expect(notice).toMatch(/not configured/)
  })

  it('never serves OpenStreetMap tiles outside dev', () => {
    expect(resolveBasemap({ provider: 'osm', dev: false }).basemap).toBeNull()
  })

  it('picks MapTiler when only a key is set', () => {
    const { basemap } = resolveBasemap({ apiKey: 'k1', dev: false })
    expect(basemap).toMatchObject({
      provider: 'maptiler',
      url: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=k1',
      tileSize: 512,
    })
  })

  it('needs a key for MapTiler', () => {
    const { basemap, notice } = resolveBasemap({
      provider: 'maptiler',
      dev: true,
    })
    expect(basemap).toBeNull()
    expect(notice).toMatch(/VITE_MAP_API_KEY/)
  })

  it('builds Stadia URLs with or without a key', () => {
    expect(
      resolveBasemap({ provider: 'stadia', apiKey: 'a b', dev: false }).basemap,
    ).toMatchObject({
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=a%20b',
    })
    expect(
      resolveBasemap({ provider: 'stadia', dev: false }).basemap,
    ).toMatchObject({
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
    })
  })

  it('always credits OpenStreetMap contributors', () => {
    for (const provider of ['maptiler', 'stadia', 'osm'] as const) {
      const { basemap } = resolveBasemap({ provider, apiKey: 'k', dev: true })
      expect(basemap?.kind === 'xyz' && basemap.attributions).toContain(
        OSM_ATTRIBUTION,
      )
    }
  })
})
