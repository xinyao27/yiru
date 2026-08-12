import type { RuntimeConnectionBootstrap } from '~shared/preload/bootstrap-contract'

export function getRuntimeLoopbackCredentials(): ReturnType<
  RuntimeConnectionBootstrap['getCredentials']
> {
  const hostWindow = window as unknown as {
    runtimeConnection: RuntimeConnectionBootstrap
  }
  return hostWindow.runtimeConnection.getCredentials()
}
