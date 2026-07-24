import { describe, expect, it, vi } from 'vite-plus/test'

import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot
} from '../../../shared/remote-server-update'
import type { PublicKnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import {
  inspectRemoteServerUpdate,
  runRemoteServerUpdate,
  type RemoteServerUpdateEntry,
  type RemoteServerUpdateTransport
} from './remote-server-update-coordinator'
import { remoteServerUpdateErrorMessage } from './remote-server-update-errors'

const environmentName = 'Build server'
const environment: PublicKnownRuntimeEnvironment = {
  id: 'server-1',
  name: environmentName,
  createdAt: 1,
  updatedAt: 1,
  lastUsedAt: null,
  runtimeId: 'runtime-old',
  endpoints: [{ id: 'ws-1', kind: 'websocket', label: environmentName, endpoint: 'ws://server' }],
  preferredEndpointId: 'ws-1'
}

function status(version: string, runtimeId = 'runtime-old', automatic = true): RuntimeStatus {
  return {
    runtimeId,
    rendererGraphEpoch: 0,
    graphStatus: 'ready',
    authoritativeWindowId: null,
    liveTabCount: 2,
    liveLeafCount: 1,
    capabilities: automatic ? ['updater.remote-control.v1'] : [],
    appVersion: version,
    remoteUpdateSupport: automatic
      ? { installMode: 'interactive', automatic: true, reason: 'available' }
      : {
          installMode: 'unsupported-headless-serve',
          automatic: false,
          reason: 'manual-service-update-required'
        }
  }
}

const availableSnapshot: RemoteServerUpdaterSnapshot = {
  appVersion: '1.4.0',
  runtimeId: 'runtime-old',
  support: { installMode: 'interactive', automatic: true, reason: 'available' },
  status: { state: 'available', version: '1.5.0', changelog: null }
}

function transport(
  overrides: Partial<RemoteServerUpdateTransport> = {}
): RemoteServerUpdateTransport {
  let clock = 0
  return {
    getRuntimeStatus: vi.fn(async () => status('1.4.0')),
    getUpdaterStatus: vi.fn(async () => availableSnapshot),
    check: vi.fn(async () => availableSnapshot),
    download: vi.fn(async () => availableSnapshot),
    install: vi.fn(
      async (): Promise<RemoteServerUpdateInstallResult> => ({
        accepted: true,
        fromVersion: '1.4.0',
        targetVersion: '1.5.0',
        runtimeId: 'runtime-old'
      })
    ),
    wait: vi.fn(async (milliseconds) => {
      clock += milliseconds
    }),
    now: () => clock,
    ...overrides
  }
}

function availableEntry(): RemoteServerUpdateEntry {
  return {
    environmentId: environment.id,
    name: environment.name,
    phase: 'available',
    currentVersion: '1.4.0',
    targetVersion: '1.5.0',
    progress: null,
    runtimeId: 'runtime-old',
    liveTabCount: 2,
    liveLeafCount: 1,
    support: availableSnapshot.support,
    error: null
  }
}

describe('remote server update coordinator', () => {
  it('gates legacy and restart-unowned servers before updater RPCs', async () => {
    await expect(
      inspectRemoteServerUpdate(
        environment,
        '1.5.0',
        transport({ getRuntimeStatus: async () => status('1.4.0', 'runtime-old', false) })
      )
    ).resolves.toMatchObject({ phase: 'manual', currentVersion: '1.4.0' })
  })

  it('downloads, installs, and proves a replacement runtime reached the target', async () => {
    const snapshots = [
      availableSnapshot,
      { ...availableSnapshot, status: { state: 'downloading', percent: 45, version: '1.5.0' } },
      { ...availableSnapshot, status: { state: 'downloaded', version: '1.5.0' } }
    ] satisfies RemoteServerUpdaterSnapshot[]
    const progress: RemoteServerUpdateEntry[] = []
    const result = await runRemoteServerUpdate(
      availableEntry(),
      transport({
        getUpdaterStatus: async () => snapshots.shift() ?? availableSnapshot,
        getRuntimeStatus: async () => status('1.5.0', 'runtime-new')
      }),
      (entry) => progress.push(entry),
      { timing: { operationTimeoutMs: 10, reconnectTimeoutMs: 10, pollIntervalMs: 1 } }
    )

    expect(result).toMatchObject({ phase: 'updated', currentVersion: '1.5.0' })
    expect(progress.map((entry) => entry.phase)).toEqual([
      'checking-update',
      'downloading',
      'downloading',
      'restarting',
      'updated'
    ])
  })

  it('rejects a runtime ownership change before install', async () => {
    const replacedSnapshot = { ...availableSnapshot, runtimeId: 'runtime-other' }
    const download = vi.fn(async () => availableSnapshot)
    const result = await runRemoteServerUpdate(
      availableEntry(),
      transport({ getUpdaterStatus: async () => replacedSnapshot, download }),
      () => undefined,
      { timing: { operationTimeoutMs: 10, reconnectTimeoutMs: 10, pollIntervalMs: 1 } }
    )

    expect(result).toMatchObject({
      phase: 'failed',
      error: remoteServerUpdateErrorMessage(new Error('remote_update_runtime_changed'))
    })
    expect(download).not.toHaveBeenCalled()
  })
})
