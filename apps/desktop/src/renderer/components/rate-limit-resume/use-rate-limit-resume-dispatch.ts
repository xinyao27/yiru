// Executes a due resume: replay the prompt that the provider limit cut short
// into the same pane, then report the outcome back to main.

import { useEffect } from 'react'
import { submitPromptToAgentPty } from '~renderer/components/native-chat/agent-paste-draft'
import { useAppStore } from '~renderer/store'
import type { RateLimitResumeSchedule } from '~shared/rate-limit-resume/types'

// Why: main re-dispatches a due schedule on every tick until its status leaves
// 'scheduled'. Replaying a prompt takes seconds, so guard against a second
// dispatch landing mid-flight and double-sending the prompt.
const replayingScheduleIds = new Set<string>()

function paneIsStillLive(schedule: RateLimitResumeSchedule): boolean {
  const ptyIds = useAppStore.getState().ptyIdsByTabId[schedule.tabId] ?? []
  return ptyIds.includes(schedule.ptyId)
}

async function replayResume(schedule: RateLimitResumeSchedule): Promise<void> {
  if (replayingScheduleIds.has(schedule.id)) {
    return
  }
  replayingScheduleIds.add(schedule.id)
  const { applyRateLimitResume } = useAppStore.getState()
  try {
    if (!paneIsStillLive(schedule)) {
      applyRateLimitResume(await window.api.rateLimitResume.markStale({ id: schedule.id }))
      return
    }
    const submitted = await submitPromptToAgentPty({
      tabId: schedule.tabId,
      ptyId: schedule.ptyId,
      content: schedule.prompt
    })
    applyRateLimitResume(
      submitted
        ? await window.api.rateLimitResume.markFired({ id: schedule.id })
        : await window.api.rateLimitResume.markFailed({
            id: schedule.id,
            reason: 'The agent pane did not accept the replayed prompt.'
          })
    )
  } catch (error) {
    console.error('Failed to resume after rate limit:', error)
  } finally {
    replayingScheduleIds.delete(schedule.id)
  }
}

/** Mounted once at App level: hydrates live schedules and runs due resumes. */
export function useRateLimitResumeDispatch(): void {
  useEffect(() => {
    const unsubscribe = window.api.rateLimitResume.onDispatchRequested((schedule) => {
      void replayResume(schedule)
    })
    void useAppStore.getState().loadRateLimitResumes()
    // Why: signals main that dispatches can land now, which also flushes any
    // resume that came due while the app was closed.
    void window.api.rateLimitResume.rendererReady()
    return unsubscribe
  }, [])
}
