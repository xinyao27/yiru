import type { StateCreator } from 'zustand'

import { runRemoteServerUpdateBatch } from '@/runtime/remote-server-update-batch'
import {
  checkingRemoteServerUpdateEntry,
  inspectRemoteServerUpdate,
  runRemoteServerUpdate,
  type RemoteServerUpdateEntry,
  type RemoteServerUpdateTransport
} from '@/runtime/remote-server-update-coordinator'
import { callRuntimeRpc, getRuntimeEnvironmentStatus } from '@/runtime/runtime-rpc-client'

import { isValidAppVersion } from '../../../../shared/app-version'
import { isUserManagedRuntimeEnvironment } from '../../../../shared/runtime-environments'
import {
  UPDATER_CHECK_CONTRACT,
  UPDATER_DOWNLOAD_CONTRACT,
  UPDATER_GET_STATUS_CONTRACT,
  UPDATER_INSTALL_CONTRACT
} from '../../../../shared/runtime-method-contracts/runtime-control-contracts'
import type { UpdateCheckOptions } from '../../../../shared/types'
import type { AppState } from '../types'

const MAX_CONCURRENT_REMOTE_SERVER_UPDATES = 2

const transport: RemoteServerUpdateTransport = {
  getRuntimeStatus: getRuntimeEnvironmentStatus,
  getUpdaterStatus: (environmentId) =>
    callRuntimeRpc({ kind: 'environment', environmentId }, UPDATER_GET_STATUS_CONTRACT, undefined, {
      timeoutMs: 15_000
    }),
  check: (environmentId, options) =>
    callRuntimeRpc({ kind: 'environment', environmentId }, UPDATER_CHECK_CONTRACT, options, {
      timeoutMs: 15_000
    }),
  download: (environmentId) =>
    callRuntimeRpc({ kind: 'environment', environmentId }, UPDATER_DOWNLOAD_CONTRACT, undefined, {
      timeoutMs: 15_000
    }),
  install: (environmentId) =>
    callRuntimeRpc({ kind: 'environment', environmentId }, UPDATER_INSTALL_CONTRACT, undefined, {
      timeoutMs: 15_000
    }),
  wait: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export type RemoteServerUpdatesSlice = {
  remoteServerUpdates: Map<string, RemoteServerUpdateEntry>
  remoteServerUpdateCheckOptions: UpdateCheckOptions | null
  remoteServerUpdatesChecking: boolean
  remoteServerUpdatesRunning: boolean
  remoteServerUpdateDialogOpen: boolean
  remoteServerUpdatesLastCheckedAt: number | null
  setRemoteServerUpdateDialogOpen: (open: boolean) => void
  refreshRemoteServerUpdates: (options?: UpdateCheckOptions) => Promise<void>
  startRemoteServerUpdates: (environmentIds?: readonly string[]) => Promise<void>
}

export const createRemoteServerUpdatesSlice: StateCreator<
  AppState,
  [],
  [],
  RemoteServerUpdatesSlice
> = (set, get) => ({
  remoteServerUpdates: new Map(),
  remoteServerUpdateCheckOptions: null,
  remoteServerUpdatesChecking: false,
  remoteServerUpdatesRunning: false,
  remoteServerUpdateDialogOpen: false,
  remoteServerUpdatesLastCheckedAt: null,

  setRemoteServerUpdateDialogOpen: (open) =>
    set({
      remoteServerUpdateDialogOpen: open,
      ...(open ? {} : { remoteServerUpdateCheckOptions: null })
    }),

  refreshRemoteServerUpdates: async (options) => {
    if (get().remoteServerUpdatesChecking || get().remoteServerUpdatesRunning) {
      return
    }
    const requestedOptions = options
      ? {
          includePrerelease: Boolean(options.includePrerelease),
          includePerfPrerelease: Boolean(options.includePerfPrerelease)
        }
      : undefined
    set({
      remoteServerUpdatesChecking: true,
      ...(requestedOptions ? { remoteServerUpdateCheckOptions: requestedOptions } : {})
    })
    try {
      const listed = await window.api.runtimeEnvironments.list()
      // Why: plain SSH/WSL hosts do not own a Yiru app lifecycle; only explicit
      // paired runtimes carry the authenticated updater RPC and restart contract.
      const environments = listed.filter(isUserManagedRuntimeEnvironment)
      get().setRuntimeEnvironments(listed)
      const previous = get().remoteServerUpdates
      set({
        remoteServerUpdates: new Map(
          environments.map((environment) => {
            const existing = previous.get(environment.id)
            return [
              environment.id,
              existing
                ? { ...existing, name: environment.name }
                : checkingRemoteServerUpdateEntry(environment)
            ]
          })
        )
      })
      const clientVersion = await window.api.updater.getVersion()
      // Why: the web client has no app build version; ask each owning runtime's
      // updater instead of comparing against the sentinel "web" version.
      const effectiveOptions =
        requestedOptions ??
        (isValidAppVersion(clientVersion)
          ? undefined
          : { includePrerelease: false, includePerfPrerelease: false })
      await Promise.allSettled(
        environments.map(async (environment) => {
          const entry = await inspectRemoteServerUpdate(
            environment,
            clientVersion,
            transport,
            effectiveOptions
          )
          set((state) => {
            const next = new Map(state.remoteServerUpdates)
            next.set(environment.id, entry)
            return { remoteServerUpdates: next }
          })
        })
      )
      set({ remoteServerUpdatesLastCheckedAt: Date.now() })
    } finally {
      set({ remoteServerUpdatesChecking: false })
    }
  },

  startRemoteServerUpdates: async (environmentIds) => {
    if (get().remoteServerUpdatesRunning) {
      return
    }
    const selected = new Set(environmentIds ?? [])
    const checkOptions = get().remoteServerUpdateCheckOptions
    const entries = [...get().remoteServerUpdates.values()].filter(
      (entry) =>
        (entry.phase === 'available' || entry.phase === 'failed') &&
        (selected.size === 0 || selected.has(entry.environmentId))
    )
    if (entries.length === 0) {
      return
    }
    set((state) => {
      const next = new Map(state.remoteServerUpdates)
      for (const entry of entries) {
        next.set(entry.environmentId, { ...entry, phase: 'queued', error: null })
      }
      return { remoteServerUpdates: next, remoteServerUpdatesRunning: true }
    })
    try {
      await runRemoteServerUpdateBatch(
        entries,
        MAX_CONCURRENT_REMOTE_SERVER_UPDATES,
        async (entry) => {
          await runRemoteServerUpdate(
            entry,
            transport,
            (progress) => {
              set((state) => {
                const next = new Map(state.remoteServerUpdates)
                next.set(entry.environmentId, progress)
                return { remoteServerUpdates: next }
              })
            },
            checkOptions ? { checkOptions } : undefined
          )
        }
      )
    } finally {
      set({ remoteServerUpdatesRunning: false, remoteServerUpdatesLastCheckedAt: Date.now() })
    }
  }
})
