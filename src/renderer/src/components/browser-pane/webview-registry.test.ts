import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

type ListenerRecord = {
  type: string
  listener: EventListenerOrEventListenerObject
  options?: boolean | AddEventListenerOptions
}

function createWebview(overrides: Partial<Electron.WebviewTag> = {}): Electron.WebviewTag {
  return {
    style: {},
    blur: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false),
    ...overrides
  } as unknown as Electron.WebviewTag
}

describe('webview registry drag listeners', () => {
  let addedListeners: ListenerRecord[]
  let removedListeners: ListenerRecord[]
  let unregisterGuestMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    addedListeners = []
    removedListeners = []
    unregisterGuestMock = vi.fn()

    vi.stubGlobal('window', {
      addEventListener: vi.fn(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions
        ) => {
          addedListeners.push({ type, listener, options })
        }
      ),
      removeEventListener: vi.fn(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions
        ) => {
          removedListeners.push({ type, listener, options })
        }
      ),
      focus: vi.fn(),
      api: {
        browser: {
          unregisterGuest: unregisterGuestMock
        }
      }
    })
    vi.stubGlobal('document', { activeElement: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not install global drag listeners until a webview is registered', async () => {
    const { registerPersistentWebview } = await import('./webview-registry')

    expect(addedListeners).toEqual([])

    registerPersistentWebview('page-1', createWebview())

    expect(addedListeners.map((entry) => entry.type)).toEqual(['dragstart', 'dragend', 'drop'])
  })

  it('removes drag listeners after the last webview is destroyed', async () => {
    const { destroyPersistentWebview, registerPersistentWebview } =
      await import('./webview-registry')

    registerPersistentWebview('page-1', createWebview())
    registerPersistentWebview('page-2', createWebview())

    expect(addedListeners).toHaveLength(3)

    destroyPersistentWebview('page-1')

    expect(removedListeners).toHaveLength(0)

    destroyPersistentWebview('page-2')

    expect(removedListeners.map((entry) => entry.type)).toEqual(['dragstart', 'dragend', 'drop'])
    expect(unregisterGuestMock).toHaveBeenCalledWith({ browserPageId: 'page-1' })
    expect(unregisterGuestMock).toHaveBeenCalledWith({ browserPageId: 'page-2' })
  })

  it('keeps one listener set across repeated registrations', async () => {
    const { registerPersistentWebview } = await import('./webview-registry')

    registerPersistentWebview('page-1', createWebview())
    registerPersistentWebview('page-2', createWebview())

    expect(addedListeners).toHaveLength(3)
  })

  it('profiles live webviews and registered browser guests for memory breadcrumbs', async () => {
    const { getBrowserWebviewMemoryProfile, registeredWebContentsIds, registerPersistentWebview } =
      await import('./webview-registry')

    registerPersistentWebview('page-1', createWebview())
    registerPersistentWebview('page-2', createWebview())
    registeredWebContentsIds.set('page-1', 101)

    expect(getBrowserWebviewMemoryProfile()).toEqual({
      browserWebviewCount: 2,
      registeredBrowserGuestCount: 1
    })
  })

  it('moves focus back to the renderer before detaching the focused webview', async () => {
    const { moveFocusToRendererBeforeWebviewDetach } = await import('./webview-registry')
    const webview = createWebview()
    vi.stubGlobal('document', { activeElement: webview })

    moveFocusToRendererBeforeWebviewDetach(webview)

    expect(webview.blur).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('moves focus back to the renderer before detaching a webview that contains focus', async () => {
    const { moveFocusToRendererBeforeWebviewDetach } = await import('./webview-registry')
    const activeElement = { blur: vi.fn() } as unknown as HTMLElement
    const webview = createWebview({ contains: vi.fn(() => true) })
    vi.stubGlobal('document', { activeElement })

    moveFocusToRendererBeforeWebviewDetach(webview)

    expect(activeElement.blur).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('moves focus back to the renderer before a focused registered webview is hidden', async () => {
    const { moveFocusToRendererBeforeFocusedWebviewHidden, registerPersistentWebview } =
      await import('./webview-registry')
    const inactiveWebview = createWebview()
    const focusedWebview = createWebview()
    vi.stubGlobal('document', { activeElement: focusedWebview })

    registerPersistentWebview('page-1', inactiveWebview)
    registerPersistentWebview('page-2', focusedWebview)

    moveFocusToRendererBeforeFocusedWebviewHidden()

    expect(inactiveWebview.blur).not.toHaveBeenCalled()
    expect(focusedWebview.blur).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('leaves focus alone before detaching an unfocused webview', async () => {
    const { moveFocusToRendererBeforeWebviewDetach } = await import('./webview-registry')
    const activeElement = { blur: vi.fn() } as unknown as HTMLElement
    const webview = createWebview()
    vi.stubGlobal('document', { activeElement })

    moveFocusToRendererBeforeWebviewDetach(webview)

    expect(activeElement.blur).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})
