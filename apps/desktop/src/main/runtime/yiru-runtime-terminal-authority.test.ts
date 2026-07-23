import { describe, expect, it, vi } from 'vite-plus/test'

// Why: release constants are injected by electron-vite and do not exist in the Node test runner.
vi.mock('../telemetry/client', () => ({ track: () => undefined }))
// Why: runtime instances register app-lifetime callbacks; no-op registrars keep tests process-local.
vi.mock('./terminal-model-query-authority', () => ({
  isNativeWindowsConptyPty: () => false,
  registerConptyDa1OverrideInstaller: () => undefined,
  shouldModelAnswerHiddenPtyQueries: () => false
}))
vi.mock('./terminal-view-attribute-store', () => ({
  getTerminalViewAttributes: () => null,
  registerTerminalViewAttributesApplier: () => undefined
}))

import { toAppSshPtyId } from '../../shared/ssh-pty-id'
import { YiruRuntimeService } from './yiru-runtime'

type PtyController = NonNullable<Parameters<YiruRuntimeService['setPtyController']>[0]>

function createPtyController(initialSize: { cols: number; rows: number }) {
  let size = initialSize
  const resizeCalls: { ptyId: string; cols: number; rows: number }[] = []
  const controller: PtyController = {
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null,
    hasRendererSerializer: () => false,
    getRendererSerializerGeneration: () => 0,
    waitForRendererSerializer: async () => false,
    getSize: () => size,
    resize: (ptyId, cols, rows) => {
      resizeCalls.push({ ptyId, cols, rows })
      size = { cols, rows }
      return true
    }
  }
  return { controller, resizeCalls }
}

describe('YiruRuntimeService terminal authority', () => {
  it('keeps pre-allocated terminal handles stable and PTY-scoped', () => {
    const runtime = new YiruRuntimeService()

    const firstHandle = runtime.preAllocateHandleForPty('pty-first')

    expect(firstHandle).toMatch(/^term_/)
    expect(runtime.preAllocateHandleForPty('pty-first')).toBe(firstHandle)
    expect(runtime.preAllocateHandleForPty('pty-second')).not.toBe(firstHandle)
  })

  it('re-adopts a live host-scoped PTY when the renderer graph reloads incomplete', () => {
    const runtime = new YiruRuntimeService()
    const windowId = 7
    const ptyId = toAppSshPtyId('ssh:host/example', 'pty-live')
    const handle = runtime.preAllocateHandleForPty(ptyId)
    const tab = {
      tabId: 'tab-live',
      worktreeId: 'worktree-live',
      title: null,
      activeLeafId: 'leaf-live',
      layout: null
    }
    const leaf = {
      tabId: tab.tabId,
      worktreeId: tab.worktreeId,
      leafId: 'leaf-live',
      paneRuntimeId: 1,
      ptyId
    }

    runtime.attachWindow(windowId)
    runtime.registerPty(ptyId, tab.worktreeId, 'host/example')
    runtime.syncWindowGraph(windowId, { tabs: [tab], leaves: [leaf] })

    expect(runtime.resolveLeafForHandle(handle)).toEqual({ ptyId })
    expect(runtime.resolveTerminalContext(handle)).toEqual({
      worktreeId: tab.worktreeId,
      connectionId: 'host/example'
    })

    runtime.markRendererReloading(windowId)
    expect(runtime.resolveLeafForHandle(handle)).toBeNull()

    const status = runtime.syncWindowGraph(windowId, {
      tabs: [tab],
      leaves: [{ ...leaf, ptyId: null }]
    })

    expect(status).toMatchObject({ graphStatus: 'ready', liveTabCount: 1, liveLeafCount: 1 })
    expect(runtime.resolveLeafForHandle(handle)).toEqual({ ptyId })
    expect(runtime.resolveTerminalContext(handle)).toEqual({
      worktreeId: tab.worktreeId,
      connectionId: 'host/example'
    })
  })

  it('reference-counts remote terminal views with idempotent releases', () => {
    const runtime = new YiruRuntimeService()
    const presence: boolean[] = []
    runtime.onRemoteTerminalViewPresenceChanged = (ptyId) => {
      presence.push(runtime.hasRemoteTerminalViewSubscriber(ptyId))
    }

    const releaseFirst = runtime.registerRemoteTerminalViewSubscriber('pty-remote')
    const releaseSecond = runtime.registerRemoteTerminalViewSubscriber('pty-remote')
    releaseFirst()
    releaseFirst()
    expect(runtime.hasRemoteTerminalViewSubscriber('pty-remote')).toBe(true)
    releaseSecond()

    expect(presence[0]).toBe(true)
    expect(presence.at(-1)).toBe(false)
    expect(runtime.hasRemoteTerminalViewSubscriber('pty-remote')).toBe(false)
  })

  it('isolates replacement subscription cleanup across relay connections', async () => {
    const runtime = new YiruRuntimeService()
    let finishOld: () => void = () => undefined
    let finishCurrent: () => void = () => undefined
    const oldGate = new Promise<void>((resolve) => {
      finishOld = resolve
    })
    const currentGate = new Promise<void>((resolve) => {
      finishCurrent = resolve
    })
    let oldCleanupCalls = 0
    let currentCleanupCalls = 0

    runtime.registerSubscriptionCleanup(
      'terminal.subscribe:device',
      () => {
        oldCleanupCalls += 1
        return oldGate
      },
      'relay-socket-old'
    )
    runtime.registerSubscriptionCleanup(
      'terminal.subscribe:device',
      () => {
        currentCleanupCalls += 1
        return currentGate
      },
      'relay-socket-current'
    )

    runtime.cleanupSubscriptionsForConnection('relay-socket-old')
    expect({ oldCleanupCalls, currentCleanupCalls }).toEqual({
      oldCleanupCalls: 1,
      currentCleanupCalls: 0
    })

    finishOld()
    await oldGate

    const firstCleanup = runtime.cleanupSubscriptionAndWait('terminal.subscribe:device')
    const joinedCleanup = runtime.cleanupSubscriptionAndWait('terminal.subscribe:device')
    expect(currentCleanupCalls).toBe(1)

    finishCurrent()
    await Promise.all([firstCleanup, joinedCleanup])
    expect(currentCleanupCalls).toBe(1)
  })

  it('serializes mobile layout authority and clears every observable state on PTY exit', async () => {
    const runtime = new YiruRuntimeService()
    const { controller, resizeCalls } = createPtyController({ cols: 120, rows: 40 })
    runtime.setPtyController(controller)

    const mobileTransition = runtime.handleMobileSubscribe('pty-mobile', 'phone-client', {
      cols: 40,
      rows: 18
    })
    const desktopTransition = runtime.reclaimTerminalForDesktop('pty-mobile')

    expect(resizeCalls).toEqual([{ ptyId: 'pty-mobile', cols: 40, rows: 18 }])
    expect(runtime.getDriver('pty-mobile')).toEqual({
      kind: 'mobile',
      clientId: 'phone-client'
    })
    expect(runtime.getLayout('pty-mobile')).toMatchObject({
      kind: 'phone',
      cols: 40,
      rows: 18,
      ownerClientId: 'phone-client',
      seq: 1
    })
    expect(runtime.getTerminalFitOverride('pty-mobile')).toMatchObject({
      mode: 'mobile-fit',
      cols: 40,
      rows: 18,
      previousCols: 120,
      previousRows: 40,
      clientId: 'phone-client'
    })
    expect(runtime.hasRemoteTerminalViewSubscriber('pty-mobile')).toBe(true)

    await expect(mobileTransition).resolves.toBe(true)
    await expect(desktopTransition).resolves.toBe(true)
    expect(resizeCalls).toEqual([
      { ptyId: 'pty-mobile', cols: 40, rows: 18 },
      { ptyId: 'pty-mobile', cols: 120, rows: 40 }
    ])
    expect(runtime.getDriver('pty-mobile')).toEqual({ kind: 'desktop' })
    expect(runtime.getLayout('pty-mobile')).toMatchObject({
      kind: 'desktop',
      cols: 120,
      rows: 40,
      seq: 2
    })
    expect(runtime.getTerminalFitOverride('pty-mobile')).toBeNull()

    await runtime.handleMobileSubscribe('pty-mobile', 'phone-client', { cols: 40, rows: 18 })
    expect(runtime.getTerminalFitOverride('pty-mobile')).not.toBeNull()

    runtime.onPtyExit('pty-mobile', 0)

    expect(runtime.getDriver('pty-mobile')).toEqual({ kind: 'idle' })
    expect(runtime.getLayout('pty-mobile')).toBeNull()
    expect(runtime.getTerminalFitOverride('pty-mobile')).toBeNull()
    expect(runtime.hasRemoteTerminalViewSubscriber('pty-mobile')).toBe(false)
  })
})
