import { ORPCError } from '@orpc/server'

import type { BrowserReplayStore } from '../browser-replay/store'
import type { WorkspaceEventLog } from '../events/log'
import { daemonImplementation } from './contract'

export function createBrowserReplayRouter(
  browserReplays: BrowserReplayStore,
  events: WorkspaceEventLog
) {
  return {
    list: daemonImplementation.browserReplay.list.handler(({ input }) => ({
      recordings: browserReplays.list(input.projectId, input.limit)
    })),
    recordResult: daemonImplementation.browserReplay.recordResult.handler(({ input }) => {
      const recording = browserReplays.get(input.recordingId)
      if (!recording || recording.projectId !== input.projectId) {
        throw new ORPCError('NOT_FOUND', { message: 'browser_replay_not_found' })
      }
      const event = events.append(input.projectId, 'browser.replay.completed', {
        detail: input.detail,
        pageUrl: input.pageUrl,
        recordingId: input.recordingId,
        success: input.success,
        worktreeId: input.worktreeId
      })
      return { eventId: event.id }
    }),
    save: daemonImplementation.browserReplay.save.handler(({ input }) => ({
      recording: browserReplays.save(input)
    }))
  }
}
