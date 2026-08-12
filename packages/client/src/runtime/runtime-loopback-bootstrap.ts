import type { PreloadApi } from '~shared/preload/api-types'

export function getRuntimeLoopbackCredentials(): ReturnType<
  PreloadApi['runtimeConnection']['getCredentials']
> {
  const hostWindow = window as unknown as {
    runtimeConnection: PreloadApi['runtimeConnection']
  }
  return hostWindow.runtimeConnection.getCredentials()
}
