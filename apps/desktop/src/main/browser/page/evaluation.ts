import type { BrowserPageHandle } from './handle'

function readEvaluationValue(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return undefined
  }
  const remoteResult = (result as Record<string, unknown>).result
  return remoteResult && typeof remoteResult === 'object'
    ? (remoteResult as Record<string, unknown>).value
    : undefined
}

export async function evaluateBrowserPage(
  page: BrowserPageHandle,
  expression: string
): Promise<unknown> {
  const cdp = page.acquireCdp()
  try {
    const result = await cdp.sendCommand('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true
    })
    return readEvaluationValue(result)
  } finally {
    cdp.release()
  }
}

export async function evaluateBrowserPageIsolated(
  page: BrowserPageHandle,
  expression: string
): Promise<unknown> {
  const cdp = page.acquireCdp()
  try {
    const frameTreeResult = await cdp.sendCommand('Page.getFrameTree')
    const frameTree =
      frameTreeResult && typeof frameTreeResult === 'object'
        ? (frameTreeResult as Record<string, unknown>).frameTree
        : null
    const frame =
      frameTree && typeof frameTree === 'object'
        ? (frameTree as Record<string, unknown>).frame
        : null
    const frameId =
      frame && typeof frame === 'object' ? (frame as Record<string, unknown>).id : undefined
    if (typeof frameId !== 'string') {
      throw new Error('Browser page has no main frame')
    }
    const world = await cdp.sendCommand('Page.createIsolatedWorld', {
      frameId,
      grantUniversalAccess: false,
      worldName: 'yiru-browser-annotation'
    })
    const executionContextId =
      world && typeof world === 'object'
        ? (world as Record<string, unknown>).executionContextId
        : undefined
    if (typeof executionContextId !== 'number') {
      throw new Error('Browser page did not create an isolated world')
    }
    const result = await cdp.sendCommand('Runtime.evaluate', {
      awaitPromise: true,
      contextId: executionContextId,
      expression,
      returnByValue: true
    })
    return readEvaluationValue(result)
  } finally {
    cdp.release()
  }
}
