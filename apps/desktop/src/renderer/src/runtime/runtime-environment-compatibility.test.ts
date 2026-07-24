import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION,
  TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '@yiru/runtime-protocol/capabilities'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { StateCreator } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { RuntimeStatus } from '../../../shared/runtime-types'
import { createRuntimeStatusSlice, type RuntimeStatusSlice } from '../store/slices/runtime-status'
import {
  clearRuntimeCompatibilityCache,
  runtimeEnvironmentSupportsCapability
} from './runtime-environment-compatibility'

function statusResponse(runtimeId: string, capabilities?: RuntimeCapability[]) {
  const status: RuntimeStatus = {
    runtimeId,
    rendererGraphEpoch: 1,
    graphStatus: 'ready',
    authoritativeWindowId: null,
    liveTabCount: 0,
    liveLeafCount: 0,
    runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
    capabilities
  }
  return {
    id: 'status.get',
    ok: true as const,
    result: status,
    _meta: { runtimeId }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function createRuntimeStatusTestStore() {
  return createStore<RuntimeStatusSlice>()(
    createRuntimeStatusSlice as unknown as StateCreator<RuntimeStatusSlice>
  )
}

afterEach(() => {
  clearRuntimeCompatibilityCache()
  vi.unstubAllGlobals()
})

describe('runtime environment capability compatibility', () => {
  it('rebuilds paired-runtime capability state after a reconnect', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(
        statusResponse('runtime-one', [TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY])
      )
      .mockResolvedValueOnce(statusResponse('runtime-one'))
    vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })

    await expect(
      runtimeEnvironmentSupportsCapability(
        'paired-host',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(true)
    await expect(
      runtimeEnvironmentSupportsCapability(
        'paired-host',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(true)
    expect(call).toHaveBeenCalledTimes(1)

    clearRuntimeCompatibilityCache('paired-host')

    await expect(
      runtimeEnvironmentSupportsCapability(
        'paired-host',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(false)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('does not let a cleared in-flight probe repopulate a newer host view', async () => {
    const lateOldResponse = deferred<ReturnType<typeof statusResponse>>()
    const currentResponse = deferred<ReturnType<typeof statusResponse>>()
    const call = vi
      .fn()
      .mockReturnValueOnce(lateOldResponse.promise)
      .mockReturnValueOnce(currentResponse.promise)
    vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })

    const oldProbe = runtimeEnvironmentSupportsCapability(
      'paired-host',
      TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
    )
    clearRuntimeCompatibilityCache('paired-host')
    const currentProbe = runtimeEnvironmentSupportsCapability(
      'paired-host',
      TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
    )

    currentResponse.resolve(statusResponse('runtime-current'))
    await expect(currentProbe).resolves.toBe(false)
    lateOldResponse.resolve(
      statusResponse('runtime-old', [TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY])
    )

    await expect(oldProbe).resolves.toBe(false)
  })

  it('invalidates a supported verdict as soon as the host is observed offline', async () => {
    const supportedStatus = statusResponse('runtime-online', [
      TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
    ])
    const call = vi
      .fn()
      .mockResolvedValueOnce(supportedStatus)
      .mockResolvedValueOnce(statusResponse('runtime-online'))
    vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })
    const store = createRuntimeStatusTestStore()
    store.getState().setRuntimeEnvironmentStatus('paired-host', {
      status: supportedStatus.result,
      checkedAt: 1
    })

    await expect(
      runtimeEnvironmentSupportsCapability(
        'paired-host',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(true)

    store.getState().setRuntimeEnvironmentStatus('paired-host', { status: null, checkedAt: 2 })

    await expect(
      runtimeEnvironmentSupportsCapability(
        'paired-host',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(false)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('does not let a removed environment ID inherit its prior capability snapshot', async () => {
    const supportedStatus = statusResponse('runtime-before-removal', [
      TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
    ])
    const call = vi
      .fn()
      .mockResolvedValueOnce(supportedStatus)
      .mockResolvedValueOnce(statusResponse('runtime-after-removal'))
    vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })
    const store = createRuntimeStatusTestStore()
    store.getState().setRuntimeEnvironmentStatus('reused-environment-id', {
      status: supportedStatus.result,
      checkedAt: 1
    })

    await expect(
      runtimeEnvironmentSupportsCapability(
        'reused-environment-id',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(true)

    store.getState().setRuntimeEnvironments([])

    await expect(
      runtimeEnvironmentSupportsCapability(
        'reused-environment-id',
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(false)
    expect(call).toHaveBeenCalledTimes(2)
  })
})
