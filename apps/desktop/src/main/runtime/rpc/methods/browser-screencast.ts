import { z } from 'zod'

import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import { Screencast } from './browser-schemas'

const ScreencastUnsubscribe = z.object({
  subscriptionId: z.string().min(1, 'Missing required --subscription-id')
})

export const BROWSER_SCREENCAST_METHODS: RpcAnyMethod[] = [
  defineStreamingMethod({
    name: 'browser.screencast',
    mobile: true,
    params: Screencast,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands, connectionId, sendBinary, signal }, emit) =>
      browserCommands.browserScreencast(params, { connectionId, sendBinary, signal, emit })
  }),
  defineMethod({
    name: 'browser.screencast.unsubscribe',
    mobile: true,
    params: ScreencastUnsubscribe,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { runtime }) => {
      runtime.cleanupSubscription(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
