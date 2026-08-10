import { getWebShellApi } from './web-shell-client'
import { getWebShellUIApi } from './web-ui-shell-client'

type RendererShellClient = {
  shell: Window['api']['shell']
  ui: Omit<Window['api']['ui'], 'get' | 'set' | 'recordFeatureInteraction'>
}

function isWebShellClient(): boolean {
  return '__YIRU_WEB_CLIENT__' in globalThis && globalThis.__YIRU_WEB_CLIENT__ === true
}

// Why: feature code targets the shell adapter, not Electron's preload object.
// Desktop delegates to preload; the web build supplies the same shell shape.
export const shellClient: RendererShellClient = {
  get shell() {
    return isWebShellClient() ? getWebShellApi() : window.api.shell
  },
  get ui() {
    return isWebShellClient() ? getWebShellUIApi() : window.api.ui
  }
}
