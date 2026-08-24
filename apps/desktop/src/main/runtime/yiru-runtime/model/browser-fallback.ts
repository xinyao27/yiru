import type { RuntimeBrowserCommands } from '~main/runtime/yiru-runtime-browser'

export function createUnavailableBrowserCommands(): RuntimeBrowserCommands {
  const unavailable = (): never => {
    throw new Error('browser_unavailable')
  }
  return new Proxy<Record<string, never>>(
    {},
    { get: () => unavailable }
  ) as unknown as RuntimeBrowserCommands
}
