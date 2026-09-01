import type { PersistedState } from '@yiru/runtime-protocol/workbench/types'
import type { PersistenceRegion } from '~main/persisted-state/regions'

export type PersistenceRuntime = {
  state: PersistedState
  scheduleSave: (region: PersistenceRegion) => void
  flushRegion: (region: PersistenceRegion) => void
  flushOrThrow: () => void
}

export type StoreMethodLookup = (method: string, args: readonly unknown[]) => unknown

export abstract class PersistenceSlice {
  private readonly runtimeHandle: PersistenceRuntime
  private readonly lookupStoreMethod: StoreMethodLookup

  constructor(runtime: PersistenceRuntime, lookupStoreMethod: StoreMethodLookup) {
    this.runtimeHandle = runtime
    this.lookupStoreMethod = lookupStoreMethod
  }

  protected get state(): PersistedState {
    return this.runtimeHandle.state
  }

  protected scheduleSave(region: PersistenceRegion): void {
    this.runtimeHandle.scheduleSave(region)
  }

  protected flushRegion(region: PersistenceRegion): void {
    this.runtimeHandle.flushRegion(region)
  }

  protected flushOrThrow(): void {
    this.runtimeHandle.flushOrThrow()
  }

  protected callStore<Result>(method: string, ...args: unknown[]): Result {
    // Why: domain slices are composed at runtime, so cross-region operations
    // cross this single lookup seam while retaining their concrete return type.
    return this.lookupStoreMethod(method, args) as Result
  }
}

export type PublicSlice<Slice> = Pick<Slice, keyof Slice>
