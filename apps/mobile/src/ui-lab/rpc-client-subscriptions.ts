import { ORPCError } from '@orpc/client'

import { translate } from '~/i18n/translate'

import {
  createRuntimeOrpcEventStream,
  type RuntimeOrpcEventStream
} from '../transport/runtime-orpc-stream'
import type { MobileUiLabScenarioId } from './fixtures'
import { uiLabInitialChatMessages, uiLabSessionTabs } from './session-fixtures'

export type UiLabSubscriptionContext = {
  scenario: MobileUiLabScenarioId
  // Why: shared with the plain-call dispatcher's `terminal.send` mock, which
  // appends a fictional user+assistant turn to simulate a live chat session.
  nativeChatListeners: Set<(payload: unknown) => void>
}

/** Mocks every oRPC subscription path the UI Lab fixture backend serves —
 *  each pushes its fixed snapshot/ready event once, then idles until the
 *  caller unsubscribes, mirroring the shape `MobileRuntimeOrpcSubscriptions`
 *  expects from a real host. */
export function createUiLabSubscription(
  path: readonly string[],
  context: UiLabSubscriptionContext,
  signal?: AbortSignal
): AsyncIterator<unknown> {
  return createRuntimeOrpcEventStream(async (stream) => {
    const onAbort = (): void => stream.cancel(signal?.reason)
    if (signal?.aborted) {
      onAbort()
    } else {
      signal?.addEventListener('abort', onAbort, { once: true })
    }
    try {
      await runUiLabSubscription(path.join('.'), context, stream)
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  })
}

async function runUiLabSubscription(
  method: string,
  context: UiLabSubscriptionContext,
  stream: RuntimeOrpcEventStream
): Promise<void> {
  switch (method) {
    case 'nativeChat.subscribe': {
      const emit = (payload: unknown): void => stream.push(payload)
      context.nativeChatListeners.add(emit)
      stream.push(
        context.scenario === 'error'
          ? {
              type: 'error',
              message: translate(
                'mobile.uiLab.fixtureTranscriptUnavailable',
                'Fixture transcript is unavailable.'
              )
            }
          : {
              type: 'snapshot',
              messages: uiLabInitialChatMessages(context.scenario),
              hasMore: false
            }
      )
      try {
        await waitForAbort(stream.signal)
      } finally {
        context.nativeChatListeners.delete(emit)
      }
      return
    }
    case 'session.tabs.subscribe':
      stream.push({ type: 'snapshot', ...uiLabSessionTabs(context.scenario) })
      await waitForAbort(stream.signal)
      return
    case 'session.tabs.subscribeAll':
      stream.push({ type: 'snapshots', snapshots: [uiLabSessionTabs(context.scenario)] })
      await waitForAbort(stream.signal)
      return
    case 'browser.screencast.subscribe':
      stream.push({
        type: 'ready',
        tab: {
          url: 'https://yiru.app/ui-lab',
          title: translate('mobile.uiLab.title', 'Yiru UI Lab'),
          canGoBack: true,
          canGoForward: false
        }
      })
      await waitForAbort(stream.signal)
      return
    case 'runtime.clientEvents.subscribe':
      stream.push({ type: 'ready' })
      await waitForAbort(stream.signal)
      return
    default:
      stream.fail(
        new ORPCError('NOT_FOUND', {
          message: translate(
            'mobile.uiLab.subscriptionNotMocked',
            'UI Lab does not mock subscription {{method}}',
            { method }
          )
        })
      )
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve()
  }
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
}
