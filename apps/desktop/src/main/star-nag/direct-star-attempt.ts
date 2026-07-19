import { starYiru } from '../github/client'
import { track } from '../telemetry/client'
import { getCohortAtEmit } from '../telemetry/cohort-classifier'
import { getStarNagAppStarSource } from './app-star-source'
import { type StarNagPromptSession, trackStarNagSessionOutcome } from './prompt-session-telemetry'

export async function runStarNagDirectStarAttempt(session: StarNagPromptSession): Promise<boolean> {
  trackStarNagSessionOutcome(session, 'star_clicked', { mode: 'gh' })
  const starred = await starYiru()
  if (!starred) {
    trackStarNagSessionOutcome(session, 'direct_star_failed', { mode: 'gh' })
    session.mode = 'web'
    return false
  }
  trackStarNagSessionOutcome(session, 'direct_star_succeeded', { mode: 'gh' })
  // Why: app_starred_yiru remains the canonical cross-surface success event;
  // star_nag_outcome is only the nag-funnel companion.
  track('app_starred_yiru', {
    source: getStarNagAppStarSource(session.source),
    ...getCohortAtEmit()
  })
  return true
}
