import type { RuntimeConnectionBootstrap } from '@yiru/shared/preload/bootstrap-contract'

// Why: preload exposes only the loopback bootstrap. All capability traffic
// moves to authenticated oRPC over the resulting WebSocket.
declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    runtimeConnection: RuntimeConnectionBootstrap
  }
}

export {}
