type ImmediateGlobal = typeof globalThis & {
  document?: unknown
  setImmediate?: (callback: () => void) => unknown
}

const pendingRendererYields = new Map<number, () => void>()
let nextRendererYieldId = 0
let rendererYieldChannel: MessageChannel | null = null

function isVitestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env?.VITEST === 'true'
}

function getRendererYieldChannel(): MessageChannel {
  if (!rendererYieldChannel) {
    rendererYieldChannel = new globalThis.MessageChannel()
    rendererYieldChannel.port1.onmessage = (event) => {
      const yieldId: unknown = event.data
      if (typeof yieldId !== 'number') {
        return
      }
      const resolve = pendingRendererYields.get(yieldId)
      if (!resolve) {
        return
      }
      pendingRendererYields.delete(yieldId)
      resolve()
    }
  }
  return rendererYieldChannel
}

// Why: renderer paste and input loops can yield thousands of times; posted
// tasks avoid Chromium's nested-timer clamp while still yielding to input and paint.
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (isVitestEnvironment()) {
      globalThis.setTimeout(resolve, 0)
      return
    }

    // Why: the shared package is also compiled by non-DOM protocol packages,
    // so runtime detection cannot refer to the renderer-only `window` global.
    const immediateGlobal = globalThis as ImmediateGlobal
    const setImmediate = immediateGlobal.setImmediate
    if (immediateGlobal.document === undefined && setImmediate) {
      setImmediate(resolve)
      return
    }

    if (typeof globalThis.MessageChannel === 'function') {
      const yieldId = nextRendererYieldId
      nextRendererYieldId += 1
      pendingRendererYields.set(yieldId, resolve)
      getRendererYieldChannel().port2.postMessage(yieldId)
      return
    }

    globalThis.setTimeout(resolve, 0)
  })
}
