// Side-effecting handlers behind the notice card's buttons, kept out of the
// component so it only decides layout and wiring.

import { submitPromptToAgentPty } from '~renderer/components/native-chat/agent-paste-draft'
import { useAppStore } from '~renderer/store'
import type { RateLimitHit, RateLimitResumeSchedule } from '~shared/rate-limit-resume/types'

/** Replay the cut-short prompt straight away and drop the notice. */
export async function retryRateLimitedPromptNow(hit: RateLimitHit): Promise<void> {
  const { dismissRateLimitHit } = useAppStore.getState()
  try {
    await submitPromptToAgentPty({
      tabId: hit.tabId,
      ptyId: hit.ptyId,
      content: hit.prompt
    })
  } catch (error) {
    console.error('Failed to retry after rate limit:', error)
  }
  dismissRateLimitHit(hit.ptyId)
}

export async function scheduleRateLimitResume(hit: RateLimitHit): Promise<void> {
  try {
    const schedule = await window.api.rateLimitResume.schedule(hit)
    useAppStore.getState().applyRateLimitResume(schedule)
  } catch (error) {
    console.error('Failed to schedule a rate-limit resume:', error)
  }
}

export async function cancelRateLimitResume(schedule: RateLimitResumeSchedule): Promise<void> {
  try {
    const cancelled = await window.api.rateLimitResume.cancel({ id: schedule.id })
    useAppStore.getState().applyRateLimitResume(cancelled)
  } catch (error) {
    console.error('Failed to cancel a rate-limit resume:', error)
  }
}

/** Ask main to dispatch now; the replay itself runs through the dispatch hook. */
export async function runRateLimitResumeNow(schedule: RateLimitResumeSchedule): Promise<void> {
  try {
    await window.api.rateLimitResume.runNow({ id: schedule.id })
  } catch (error) {
    console.error('Failed to run a rate-limit resume now:', error)
  }
}
