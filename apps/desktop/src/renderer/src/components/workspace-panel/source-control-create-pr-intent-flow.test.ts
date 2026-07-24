import { describe, expect, it } from 'vite-plus/test'

import { prepareCreatePrIntentBeforeCommit } from './source-control-create-pr-intent-flow'

describe('prepareCreatePrIntentBeforeCommit', () => {
  it('fast-forwards and refreshes a behind-only branch before staging', async () => {
    const calls: string[] = []

    const outcome = await prepareCreatePrIntentBeforeCommit({
      refresh: async () => {
        calls.push('refresh')
        return true
      },
      readUpstreamStatus: () => ({ hasUpstream: true, ahead: 0, behind: 2 }),
      fastForward: async () => {
        calls.push('fast_forward')
        return { status: 'ok' }
      },
      stage: async () => {
        calls.push('stage')
        return true
      }
    })

    expect(outcome).toBe('ready')
    expect(calls).toEqual(['refresh', 'fast_forward', 'refresh', 'stage'])
  })

  it.each(['failed', 'superseded'] as const)(
    'stops before staging when fast-forward is %s',
    async (status) => {
      const calls: string[] = []

      const outcome = await prepareCreatePrIntentBeforeCommit({
        refresh: async () => {
          calls.push('refresh')
          return true
        },
        readUpstreamStatus: () => ({ hasUpstream: true, ahead: 0, behind: 1 }),
        fastForward: async () => {
          calls.push('fast_forward')
          return { status }
        },
        stage: async () => {
          calls.push('stage')
          return true
        }
      })

      expect(outcome).toBe(status === 'failed' ? 'remote_failed' : 'superseded')
      expect(calls).toEqual(['refresh', 'fast_forward'])
    }
  )
})
