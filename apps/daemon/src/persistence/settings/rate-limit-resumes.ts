import { randomUUID } from 'node:crypto'

import {
  isFinalRateLimitResumeStatus,
  RATE_LIMIT_RESUME_HISTORY_MAX_AGE_MS,
  type RateLimitHit,
  type RateLimitResumeSchedule
} from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'

import { PersistenceSlice } from '../slice'

export class RateLimitResumeSlice extends PersistenceSlice {
  listRateLimitResumes(): RateLimitResumeSchedule[] {
    const now = Date.now()
    return (this.state.rateLimitResumes ?? []).filter(
      (schedule) =>
        !isFinalRateLimitResumeStatus(schedule.status) ||
        now - schedule.createdAt < RATE_LIMIT_RESUME_HISTORY_MAX_AGE_MS
    )
  }

  createRateLimitResume(hit: RateLimitHit, resumeAt: number): RateLimitResumeSchedule {
    const now = Date.now()
    const schedule: RateLimitResumeSchedule = {
      ...hit,
      id: randomUUID(),
      resumeAt,
      status: 'scheduled',
      createdAt: now,
      firedAt: null,
      failureReason: null
    }
    // Why: one pane can only be blocked on one limit at a time — replacing any
    // earlier live schedule for it keeps the card and the tick in agreement.
    this.state.rateLimitResumes = [
      ...this.listRateLimitResumes().filter(
        (entry) => entry.ptyId !== hit.ptyId || isFinalRateLimitResumeStatus(entry.status)
      ),
      schedule
    ]
    this.callStore<void>('flush')
    return schedule
  }

  updateRateLimitResume(
    id: string,
    updates: Partial<Pick<RateLimitResumeSchedule, 'status' | 'firedAt' | 'failureReason'>>
  ): RateLimitResumeSchedule {
    const schedules = this.listRateLimitResumes()
    const index = schedules.findIndex((entry) => entry.id === id)
    if (index === -1) {
      throw new Error('Rate-limit resume not found.')
    }
    const updated = { ...schedules[index], ...updates }
    schedules[index] = updated
    this.state.rateLimitResumes = schedules
    this.callStore<void>('flush')
    return updated
  }

  deleteRateLimitResume(id: string): void {
    this.state.rateLimitResumes = this.listRateLimitResumes().filter((entry) => entry.id !== id)
    this.callStore<void>('flush')
  }
}
