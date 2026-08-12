import type { RuntimeConnectionBootstrap } from '~shared/preload/bootstrap-contract'

function getRuntimeConnectionBootstrap(): RuntimeConnectionBootstrap {
  const hostWindow = window as unknown as {
    runtimeConnection: RuntimeConnectionBootstrap
  }
  return hostWindow.runtimeConnection
}

export function getRuntimeLoopbackCredentials(): ReturnType<
  RuntimeConnectionBootstrap['getCredentials']
> {
  return getRuntimeConnectionBootstrap().getCredentials()
}
