import type { Preview } from '@storybook/tanstack-react'

import { MapBasemapProvider } from '#/components/map/MapView'

const preview: Preview = {
  // Maps draw no basemap in stories, so tests never fetch tiles. A story can
  // still pass its own `basemap` (e.g. the local tile grid).
  decorators: [
    (Story) => (
      <MapBasemapProvider basemap={null}>
        <Story />
      </MapBasemapProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
}

export default preview
