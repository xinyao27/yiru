import { TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

// Why: the integration fixture creates a real host service outside Electron's
// app lifetime, so process-global registrations stay inert in the test runner.
vi.mock('../src/main/telemetry/client', () => ({ track: () => undefined }))
vi.mock('../src/main/runtime/terminal-model-query-authority', () => ({
  isNativeWindowsConptyPty: () => false,
  registerConptyDa1OverrideInstaller: () => undefined,
  resolveTerminalQueryReplyOwner: () => 'renderer'
}))
vi.mock('../src/main/runtime/terminal-view-attribute-store', () => ({
  getTerminalViewAttributes: () => null,
  registerTerminalViewAttributesApplier: () => undefined
}))

import { YiruRuntimeService } from '../src/main/runtime/yiru-runtime'
import {
  clearRuntimeCompatibilityCache,
  runtimeEnvironmentSupportsCapability
} from '../src/renderer/src/runtime/runtime-environment-compatibility'

type PtyController = NonNullable<Parameters<YiruRuntimeService['setPtyController']>[0]>

function createPtyController(): PtyController {
  return {
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null,
    hasRendererSerializer: () => false,
    getRendererSerializerGeneration: () => 0,
    waitForRendererSerializer: async () => false,
    getSize: () => ({ cols: 100, rows: 30 }),
    resize: () => true
  }
}

afterEach(() => {
  clearRuntimeCompatibilityCache()
  vi.unstubAllGlobals()
})

describe('mixed-version terminal continuity', () => {
  it('keeps a live host PTY while client capability state is rebuilt after an upgrade', async () => {
    const runtime = new YiruRuntimeService()
    const ptyId = 'pty-mixed-version-upgrade'
    const handle = runtime.preAllocateHandleForPty(ptyId)
    const environmentId = 'paired-host'
    const hostStatus = runtime.getStatus()
    hostStatus.capabilities = [
      ...(hostStatus.capabilities ?? []),
      TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
    ]
    const call = vi.fn().mockResolvedValue({
      id: 'status.get',
      ok: true,
      result: hostStatus,
      _meta: { runtimeId: runtime.getRuntimeId() }
    })
    vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })

    runtime.setPtyController(createPtyController())
    runtime.registerPty(ptyId, 'worktree-mixed-version')
    runtime.onPtyData(ptyId, 'before upgrade\n', 1)

    await expect(
      runtimeEnvironmentSupportsCapability(
        environmentId,
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(true)
    await expect(runtime.readTerminal(handle)).resolves.toMatchObject({
      status: 'running',
      tail: ['before upgrade']
    })

    // Why: a desktop upgrade rebuilds renderer-owned compatibility state; the
    // paired host still owns the live PTY across that client-only boundary.
    clearRuntimeCompatibilityCache(environmentId)

    await expect(
      runtimeEnvironmentSupportsCapability(
        environmentId,
        TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
      )
    ).resolves.toBe(true)
    expect(call).toHaveBeenCalledTimes(2)
    expect(runtime.resolveTerminalContext(handle)).toEqual({
      worktreeId: 'worktree-mixed-version',
      connectionId: null
    })
    await expect(runtime.readTerminal(handle)).resolves.toMatchObject({ status: 'running' })
  })
})
