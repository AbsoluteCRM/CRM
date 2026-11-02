/**
 * Swappable basemap providers (ADR 0014). The app only ever asks for "the
 * basemap"; which hosted service draws it is config, set by
 * `VITE_MAP_PROVIDER` and `VITE_MAP_API_KEY`. Only the client-side map chunk
 * imports this file, because it imports OpenLayers.
 */
import TileDebug from 'ol/source/TileDebug'
import XYZ from 'ol/source/XYZ'
import type TileSource from 'ol/source/Tile'

export type MapProviderId = 'maptiler' | 'stadia' | 'osm'

export type Basemap =
  | {
      kind: 'xyz'
      provider: MapProviderId
      url: string
      tileSize: number
      /** HTML strings, shown in the map's attribution control. */
      attributions: Array<string>
    }
  /** Local tile-grid outlines with no network access, for stories and tests. */
  | { kind: 'grid' }

export interface BasemapResolution {
  basemap: Basemap | null
  /** Why there is no basemap, shown as a small note on the map. */
  notice?: string
}

const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noreferrer">${text}</a>`

export const OSM_ATTRIBUTION = `© ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} contributors`
const MAPTILER_ATTRIBUTION = `© ${link('https://www.maptiler.com/copyright/', 'MapTiler')}`
const STADIA_ATTRIBUTION = `© ${link('https://stadiamaps.com/', 'Stadia Maps')}`
const OPENMAPTILES_ATTRIBUTION = `© ${link('https://openmaptiles.org/', 'OpenMapTiles')}`

/**
 * Picks the basemap from config. Unset, the provider is MapTiler when a key is
 * present, OpenStreetMap in dev, and nothing in production: OSM's public tiles
 * may not carry production traffic, and a missing MapTiler key would only
 * draw error tiles.
 */
export function resolveBasemap({
  provider,
  apiKey,
  dev,
}: {
  provider?: MapProviderId
  apiKey?: string
  dev: boolean
}): BasemapResolution {
  const id = provider ?? (apiKey ? 'maptiler' : dev ? 'osm' : undefined)
  const key = apiKey ? encodeURIComponent(apiKey) : undefined

  switch (id) {
    case 'maptiler':
      if (!key) {
        return {
          basemap: null,
          notice: 'Basemap not configured: MapTiler needs VITE_MAP_API_KEY.',
        }
      }
      return {
        basemap: {
          kind: 'xyz',
          provider: 'maptiler',
          url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`,
          tileSize: 512,
          attributions: [MAPTILER_ATTRIBUTION, OSM_ATTRIBUTION],
        },
      }
    case 'stadia':
      // Stadia also accepts domain-based auth, so the key is optional.
      return {
        basemap: {
          kind: 'xyz',
          provider: 'stadia',
          url: `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png${key ? `?api_key=${key}` : ''}`,
          tileSize: 256,
          attributions: [
            STADIA_ATTRIBUTION,
            OPENMAPTILES_ATTRIBUTION,
            OSM_ATTRIBUTION,
          ],
        },
      }
    case 'osm':
      if (!dev) {
        return {
          basemap: null,
          notice:
            'Basemap not configured: OpenStreetMap tiles are for development only.',
        }
      }
      return {
        basemap: {
          kind: 'xyz',
          provider: 'osm',
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          tileSize: 256,
          attributions: [OSM_ATTRIBUTION],
        },
      }
    default:
      return {
        basemap: null,
        notice: 'Basemap not configured: set VITE_MAP_PROVIDER.',
      }
  }
}

/** The OpenLayers tile source for a basemap, with its attribution. */
export function createBasemapSource(basemap: Basemap): TileSource {
  if (basemap.kind === 'grid') {
    return new TileDebug({ template: '' })
  }
  return new XYZ({
    url: basemap.url,
    tileSize: basemap.tileSize,
    maxZoom: 19,
    attributions: basemap.attributions,
    attributionsCollapsible: false,
  })
}
