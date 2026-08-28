import type {
  BrowserEvalResult,
  BrowserScreencastResult,
  BrowserScreenshotResult,
  BrowserTabShowResult
} from '@yiru/runtime-protocol/contract'
import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame,
  type BrowserScreencastFrameMetadata
} from '@yiru/runtime-protocol/workbench/browser/screencast-protocol'

import { daemonImplementation } from '../contract'
import type { BrowserCommandDelegate } from './router'

const subscriptions = new Map<string, AbortController>()

export function createScreencastHandlers(delegate: BrowserCommandDelegate) {
  return {
    screencast: {
      subscribe: daemonImplementation.browser.screencast.subscribe.handler(async function* ({
        context,
        input,
        signal
      }): AsyncGenerator<BrowserScreencastResult> {
        if (!context.sendBinary) {
          yield { message: 'browser_screencast_binary_transport_required', type: 'error' }
          return
        }
        const subscriptionId = crypto.randomUUID()
        const controller = new AbortController()
        subscriptions.set(subscriptionId, controller)
        const stop = (): void => controller.abort()
        signal?.addEventListener('abort', stop, { once: true })
        try {
          await applyViewport(delegate, input)
          const shown = await delegate<BrowserTabShowResult>('browser.tabShow', input)
          yield {
            browserPageId: shown.tab.browserPageId,
            format: input.format,
            subscriptionId,
            tab: shown.tab,
            type: 'ready'
          }
          const metadata = await readFrameMetadata(delegate, input)
          const intervalMs = Math.min(1_000, Math.max(100, input.minFrameIntervalMs ?? 150))
          let sequence = 0
          while (!signal?.aborted && !controller.signal.aborted) {
            const screenshot = await delegate<BrowserScreenshotResult>('browser.screenshot', {
              ...input,
              format: input.format
            })
            const image = Uint8Array.from(Buffer.from(screenshot.data, 'base64'))
            context.sendBinary(
              encodeBrowserScreencastFrame({
                format: screenshot.format,
                image,
                metadata,
                opcode: BrowserScreencastOpcode.Frame,
                seq: sequence++
              })
            )
            await Bun.sleep(intervalMs)
          }
          yield { subscriptionId, type: 'end' }
        } catch (error) {
          yield {
            message: error instanceof Error ? error.message : String(error),
            type: 'error'
          }
        } finally {
          signal?.removeEventListener('abort', stop)
          subscriptions.delete(subscriptionId)
        }
      }),
      unsubscribe: daemonImplementation.browser.screencast.unsubscribe.handler(({ input }) => {
        subscriptions.get(input.subscriptionId)?.abort()
        return { unsubscribed: true as const }
      })
    }
  }
}

async function applyViewport(
  delegate: BrowserCommandDelegate,
  input: {
    page?: string
    worktree?: string
    viewportWidth?: number
    viewportHeight?: number
    deviceScaleFactor?: number
    mobile?: boolean
  }
): Promise<void> {
  if (input.viewportWidth === undefined || input.viewportHeight === undefined) {
    return
  }
  await delegate('browser.viewport', {
    ...input,
    deviceScaleFactor: input.deviceScaleFactor,
    height: input.viewportHeight,
    mobile: input.mobile,
    width: input.viewportWidth
  })
}

async function readFrameMetadata(
  delegate: BrowserCommandDelegate,
  input: { page?: string; worktree?: string }
): Promise<BrowserScreencastFrameMetadata> {
  const response = await delegate<BrowserEvalResult>('browser.eval', {
    ...input,
    expression:
      'JSON.stringify({deviceWidth:innerWidth,deviceHeight:innerHeight,imageWidth:innerWidth*devicePixelRatio,imageHeight:innerHeight*devicePixelRatio,pageScaleFactor:devicePixelRatio,scrollOffsetX:scrollX,scrollOffsetY:scrollY,timestamp:performance.now()})'
  })
  try {
    const value: unknown = JSON.parse(response.result)
    return typeof value === 'object' && value !== null ? readMetadata(value) : {}
  } catch {
    return {}
  }
}

function readMetadata(value: object): BrowserScreencastFrameMetadata {
  const metadata: BrowserScreencastFrameMetadata = {}
  for (const key of [
    'deviceHeight',
    'deviceWidth',
    'imageHeight',
    'imageWidth',
    'pageScaleFactor',
    'scrollOffsetX',
    'scrollOffsetY',
    'timestamp'
  ] as const) {
    const candidate = Reflect.get(value, key)
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      metadata[key] = candidate
    }
  }
  return metadata
}
