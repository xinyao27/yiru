import { acquireCdp, releaseCdp, sendCdp } from '../cdp/session'

export async function evaluateBrowserValue(tabId: number, expression: string): Promise<unknown> {
  return withBrowserCdp(tabId, async () => {
    const response = await sendCdp(tabId, 'Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true
    })
    const exception = readRecordValue(response, 'exceptionDetails')
    if (exception) {
      const text = Reflect.get(exception, 'text')
      throw new Error(typeof text === 'string' ? text : 'browser_evaluation_failed')
    }
    const result = readRecordValue(response, 'result')
    return result ? Reflect.get(result, 'value') : undefined
  })
}

export async function sendBrowserCdp(
  tabId: number,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  return withBrowserCdp(tabId, () => sendCdp(tabId, method, params))
}

async function withBrowserCdp<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  await acquireCdp(tabId, 'browser-use')
  try {
    return await operation()
  } finally {
    await releaseCdp(tabId, 'browser-use')
  }
}

function readRecordValue(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const nested = Reflect.get(value, key)
  return typeof nested === 'object' && nested !== null ? nested : null
}
