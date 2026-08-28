import { acquireAgentOverlay, releaseAgentOverlay } from '../agent-overlay'
import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from './session'

const MAX_TRACE_CHARS = 6 * 1024 * 1024

export type PerformanceAuditCapture = {
  data: string
  metrics: Record<string, number>
  pageUrl: string
}

export async function runPerformanceAudit(tabId: number): Promise<PerformanceAuditCapture> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || !isLocalPreviewUrl(tab.url)) {
    throw new Error('performance_audit_requires_local_preview')
  }
  await acquireCdp(tabId, 'performance-audit')
  try {
    await acquireAgentOverlay(tabId, 'performance-audit')
    await Promise.all([
      sendCdp(tabId, 'Page.enable'),
      sendCdp(tabId, 'Performance.enable'),
      sendCdp(tabId, 'Runtime.enable')
    ])
    await sendCdp(tabId, 'Tracing.start', {
      categories: 'devtools.timeline,loading,blink.user_timing,v8.execute',
      options: 'sampling-frequency=10000',
      transferMode: 'ReturnAsStream'
    })
    const loaded = waitForCdpEvent(tabId, 'Page.loadEventFired', 30_000)
    await sendCdp(tabId, 'Page.reload', { ignoreCache: false })
    await loaded
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    const [rawMetrics, webVitals, contrast] = await Promise.all([
      sendCdp(tabId, 'Performance.getMetrics'),
      sendCdp(tabId, 'Runtime.evaluate', {
        expression: webVitalsExpression(),
        returnByValue: true
      }),
      sendCdp(tabId, 'Audits.enable')
        .then(() => sendCdp(tabId, 'Audits.checkContrast', { reportAAA: false }))
        .catch(() => null)
    ])
    const tracingComplete = waitForCdpEvent(tabId, 'Tracing.tracingComplete', 15_000)
    await sendCdp(tabId, 'Tracing.end')
    const traceEvent = await tracingComplete
    const trace = await readTraceStream(tabId, Reflect.get(traceEvent, 'stream'))
    const metrics = {
      ...parsePerformanceMetrics(rawMetrics),
      ...parseWebVitals(webVitals)
    }
    return {
      data: JSON.stringify({
        contrastAudit: contrast,
        generatedAt: Date.now(),
        metrics,
        pageUrl: tab.url,
        trace: trace.data,
        traceTruncated: trace.truncated
      }),
      metrics,
      pageUrl: tab.url
    }
  } finally {
    await sendCdp(tabId, 'Tracing.end').catch(() => {})
    await releaseAgentOverlay(tabId, 'performance-audit')
    await releaseCdp(tabId, 'performance-audit')
  }
}

async function readTraceStream(
  tabId: number,
  stream: unknown
): Promise<{ data: string; truncated: boolean }> {
  if (typeof stream !== 'string') {
    return { data: '', truncated: false }
  }
  let data = ''
  let eof = false
  while (!eof && data.length < MAX_TRACE_CHARS) {
    const result = await sendCdp(tabId, 'IO.read', { handle: stream, size: 256 * 1_024 })
    if (typeof result !== 'object' || result === null) {
      break
    }
    const chunk = Reflect.get(result, 'data')
    if (typeof chunk === 'string') {
      data += chunk.slice(0, MAX_TRACE_CHARS - data.length)
    }
    eof = Reflect.get(result, 'eof') === true
  }
  await sendCdp(tabId, 'IO.close', { handle: stream }).catch(() => {})
  return { data, truncated: !eof }
}

function waitForCdpEvent(
  tabId: number,
  expectedMethod: string,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error('cdp_event_timeout'))
    }, timeoutMs)
    const unsubscribe = subscribeCdp((eventTabId, method, params) => {
      if (eventTabId === tabId && method === expectedMethod) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(params)
      }
    })
  })
}

function parsePerformanceMetrics(value: unknown): Record<string, number> {
  const entries = typeof value === 'object' && value !== null ? Reflect.get(value, 'metrics') : null
  if (!Array.isArray(entries)) {
    return {}
  }
  return Object.fromEntries(
    entries.flatMap((entry) => {
      const name = typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'name') : null
      const metric =
        typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'value') : null
      return typeof name === 'string' && typeof metric === 'number' ? [[name, metric]] : []
    })
  )
}

function parseWebVitals(value: unknown): Record<string, number> {
  const result = typeof value === 'object' && value !== null ? Reflect.get(value, 'result') : null
  const direct = typeof result === 'object' && result !== null ? Reflect.get(result, 'value') : null
  if (typeof direct !== 'object' || direct === null) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(direct).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    )
  )
}

function webVitalsExpression(): string {
  return `(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime]));
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
    return {
      domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
      firstContentfulPaint: paints['first-contentful-paint'] ?? 0,
      largestContentfulPaint: lcp?.startTime ?? 0,
      loadEvent: navigation?.loadEventEnd ?? 0
    };
  })()`
}

function isLocalPreviewUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  )
}
