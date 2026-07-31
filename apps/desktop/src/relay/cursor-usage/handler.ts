import { fetchCursorRateLimits } from '~main/runtime/cursor-usage/fetcher'

import type { RelayDispatcher } from '../dispatcher'

export class ProviderUsageHandler {
  constructor(dispatcher: RelayDispatcher) {
    dispatcher.onRequest('usage.cursor', (_params, context) =>
      fetchCursorRateLimits({ signal: context.signal, target: { runtime: 'host' } })
    )
  }
}
