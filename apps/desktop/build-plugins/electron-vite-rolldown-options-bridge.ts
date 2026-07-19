import type { Plugin, UserConfig } from 'vite'

export function createElectronViteRolldownOptionsBridge(): Plugin {
  return {
    name: 'yiru-electron-vite-rolldown-options-bridge',
    enforce: 'post',
    config(config: UserConfig) {
      const rollupOptions = config.build?.rollupOptions
      if (!rollupOptions || !config.build) {
        return
      }

      // Why: electron-vite 5 writes its format and dependency externals to the
      // legacy field, while Vite 8's Rolldown build reads them from this field.
      config.build.rolldownOptions = {
        ...config.build.rolldownOptions,
        external: rollupOptions.external,
        output: rollupOptions.output
      }
    }
  }
}
