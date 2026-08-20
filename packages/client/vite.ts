import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const CLIENT_SOURCE_ROOT = fileURLToPath(new URL('./src', import.meta.url))
const SHARED_SOURCE_ROOT = fileURLToPath(new URL('../shared/src', import.meta.url))

export type ClientVitePresetOptions = {
  featureWallEnabled: boolean
}

export function createClientVitePreset(options: ClientVitePresetOptions) {
  return {
    root: CLIENT_SOURCE_ROOT,
    // Why: the client owns both plugin versions and their ordering, so every
    // host compiles its TSX and Tailwind source with the same toolchain.
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '~renderer': CLIENT_SOURCE_ROOT,
        '~shared': SHARED_SOURCE_ROOT
      }
    },
    worker: {
      format: 'es' as const
    },
    define: {
      YIRU_FEATURE_WALL_ENABLED: JSON.stringify(options.featureWallEnabled)
    }
  }
}
