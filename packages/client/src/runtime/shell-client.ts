import { electronShellPlatformApi, type ShellPlatformApi } from './shell-platform-client'
import { electronShellUiApi, type ShellUiApi } from './shell-ui-client'
import { getWebShellApi } from './web-shell-client'
import { getWebShellUIApi } from './web-ui-shell-client'

type RendererShellClient = {
  shell: ShellPlatformApi
  ui: ShellUiApi
}

function isWebShellClient(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

// Why: feature code targets the shell adapter, not Electron's preload object.
// Desktop delegates to preload; the web build supplies the same shell shape.
export const shellClient: RendererShellClient = {
  get shell() {
    return isWebShellClient() ? getWebShellApi() : electronShellPlatformApi
  },
  get ui() {
    return isWebShellClient() ? getWebShellUIApi() : electronShellUiApi
  }
}
