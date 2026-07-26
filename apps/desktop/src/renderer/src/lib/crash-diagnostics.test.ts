import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('renderer crash diagnostics', () => {
  it('attributes a high-water heap sample once per crossed threshold', async () => {
    vi.resetModules()
    const recordBreadcrumb = vi.fn()
    const intervalCallbacks: (() => void)[] = []
    const memory = {
      usedJSHeapSize: 0.7 * 100 * 1024 * 1024,
      totalJSHeapSize: 80 * 1024 * 1024,
      jsHeapSizeLimit: 100 * 1024 * 1024
    }
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn((callback: () => void) => {
        intervalCallbacks.push(callback)
        return 1
      }),
      clearInterval: vi.fn(),
      performance: { memory }
    })
    vi.stubGlobal('document', {
      getElementsByTagName: () => ({ length: 4321 }),
      querySelectorAll: () => ({ length: 6 })
    })
    vi.doMock('../runtime/browser-webview-registry', () => ({
      getBrowserWebviewMemoryProfile: () => ({
        browserWebviewCount: 4,
        registeredBrowserGuestCount: 3
      })
    }))
    vi.doMock('./crash-breadcrumb-recorder', () => ({
      recordRendererCrashBreadcrumb: recordBreadcrumb
    }))

    const profile = await import('./renderer-memory-profile')
    const unregister = profile.registerRendererMemoryProfileContributor('store', () => ({
      worktrees: 12
    }))
    const diagnostics = await import('./crash-diagnostics')
    diagnostics.installRendererCrashDiagnostics()

    expect(recordBreadcrumb).toHaveBeenCalledWith(
      'renderer_memory_highwater',
      expect.objectContaining({
        thresholdPct: 60,
        rendererSurface: 'main',
        domNodes: 4321,
        terminalElements: 6,
        browserWebviews: 4,
        registeredBrowserGuests: 3,
        'store.worktrees': 12
      })
    )
    intervalCallbacks[0]?.()
    expect(
      recordBreadcrumb.mock.calls.filter(([name]) => name === 'renderer_memory_highwater')
    ).toHaveLength(1)

    memory.usedJSHeapSize = 0.85 * memory.jsHeapSizeLimit
    intervalCallbacks[0]?.()
    expect(
      recordBreadcrumb.mock.calls.filter(([name]) => name === 'renderer_memory_highwater')
    ).toHaveLength(2)
    unregister()
  })
})
