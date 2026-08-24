import { randomUUID } from 'node:crypto'

import { sanitizeRepoIcon } from '@yiru/workbench-model/workspace'
import { getDefaultRepoHookSettings } from '~shared/constants'
import {
  isFinalRateLimitResumeStatus,
  RATE_LIMIT_RESUME_HISTORY_MAX_AGE_MS,
  type RateLimitHit,
  type RateLimitResumeSchedule
} from '~shared/rate-limit-resume/types'
import { isFolderRepo } from '~shared/repo-kind'
import { normalizeRepoSourceControlAiOverrides } from '~shared/source-control/ai'
import type {
  ProjectHostSetup,
  ProjectHostSetupUpdateArgs,
  Repo,
  SparsePreset
} from '~shared/types'

import {
  sanitizeRepoUpstream,
  sanitizeGitRemoteIdentity,
  sanitizeRepoProjectHostSetupMethod,
  sanitizeForkSyncMode
} from './persistence-repo-sanitization'
import { StoreLayer4 } from './persistence-store-layer-4'

export abstract class StoreLayer5 extends StoreLayer4 {
  protected updateIndependentProjectHostSetup(
    setup: ProjectHostSetup,
    updates: ProjectHostSetupUpdateArgs['updates']
  ): ProjectHostSetup {
    if (updates.displayName !== undefined) {
      setup.displayName = updates.displayName.trim() || setup.displayName
    }
    if (updates.path !== undefined) {
      setup.path = updates.path.trim() || setup.path
    }
    if (updates.worktreeBasePath !== undefined) {
      const worktreeBasePath = updates.worktreeBasePath.trim()
      if (worktreeBasePath) {
        setup.worktreeBasePath = worktreeBasePath
      } else {
        delete setup.worktreeBasePath
      }
    }
    if (updates.kind !== undefined) {
      setup.kind = updates.kind
    }
    if (updates.gitUsername !== undefined) {
      const gitUsername = updates.gitUsername.trim()
      if (gitUsername) {
        setup.gitUsername = gitUsername
      } else {
        delete setup.gitUsername
      }
    }
    if (updates.setupState !== undefined) {
      setup.setupState = updates.setupState
    }
    if (updates.setupMethod !== undefined) {
      setup.setupMethod = updates.setupMethod
    }
    setup.updatedAt = Date.now()
    this.scheduleSave()
    return setup
  }

  protected hydrateRepo(repo: Repo): Repo {
    const {
      repoIcon: rawRepoIcon,
      upstream: rawUpstream,
      gitRemoteIdentity: rawGitRemoteIdentity,
      sourceControlAi: rawSourceControlAi,
      projectHostSetupMethod: rawProjectHostSetupMethod,
      forkSyncMode: rawForkSyncMode,
      ...repoWithoutIcon
    } = repo
    const repoIcon = sanitizeRepoIcon(rawRepoIcon)
    const upstream = sanitizeRepoUpstream(rawUpstream)
    const gitRemoteIdentity = sanitizeGitRemoteIdentity(rawGitRemoteIdentity)
    const sourceControlAi = normalizeRepoSourceControlAiOverrides(rawSourceControlAi)
    const projectHostSetupMethod = sanitizeRepoProjectHostSetupMethod(rawProjectHostSetupMethod)
    const forkSyncMode = sanitizeForkSyncMode(rawForkSyncMode)
    const gitUsername = isFolderRepo(repo) ? '' : (repo.gitUsername ?? '')

    return {
      ...repoWithoutIcon,
      ...(repoIcon !== undefined ? { repoIcon } : {}),
      ...(upstream !== undefined ? { upstream } : {}),
      ...(gitRemoteIdentity !== undefined ? { gitRemoteIdentity } : {}),
      ...(sourceControlAi !== undefined ? { sourceControlAi } : {}),
      ...(projectHostSetupMethod !== undefined ? { projectHostSetupMethod } : {}),
      ...(forkSyncMode !== undefined ? { forkSyncMode } : {}),
      kind: isFolderRepo(repo) ? 'folder' : 'git',
      gitUsername,
      hookSettings: {
        ...getDefaultRepoHookSettings(),
        ...repo.hookSettings,
        scripts: {
          ...getDefaultRepoHookSettings().scripts,
          ...repo.hookSettings?.scripts
        }
      }
    }
  }

  // ── Sparse Presets ─────────────────────────────────────────────────

  getSparsePresets(repoId: string): SparsePreset[] {
    return [...(this.state.sparsePresetsByRepo[repoId] ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  }

  saveSparsePreset(preset: SparsePreset): SparsePreset {
    const existing = this.state.sparsePresetsByRepo[preset.repoId] ?? []
    const index = existing.findIndex((entry) => entry.id === preset.id)
    this.state.sparsePresetsByRepo[preset.repoId] =
      index === -1
        ? [...existing, preset]
        : existing.map((entry, i) => (i === index ? preset : entry))
    this.scheduleSave()
    return preset
  }

  removeSparsePreset(repoId: string, presetId: string): void {
    const existing = this.state.sparsePresetsByRepo[repoId] ?? []
    this.state.sparsePresetsByRepo[repoId] = existing.filter((entry) => entry.id !== presetId)
    this.scheduleSave()
  }

  // ── Rate-limit resumes ────────────────────────────────────────────

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
    this.flush()
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
    this.flush()
    return updated
  }

  deleteRateLimitResume(id: string): void {
    this.state.rateLimitResumes = this.listRateLimitResumes().filter((entry) => entry.id !== id)
    this.flush()
  }
}
