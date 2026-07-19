import { useCallback, useEffect, useRef, useState } from 'react'
import type { Repo, RepoHookSettings } from '../../../../shared/types'
import {
  areHookSettingsDraftsEqual,
  getHookSettingsDraft,
  type HookSettingsPolicyDraft,
  type LocalHookName
} from './repository-hook-settings-model'

export function useRepositoryHookSettingsDraft({
  repo,
  repoHostIdentity,
  onUpdateHookSettings
}: {
  repo: Repo
  repoHostIdentity: string
  onUpdateHookSettings: (settings: RepoHookSettings) => void
}): {
  hookSettingsDraft: RepoHookSettings
  updateScriptDraft: (hookName: LocalHookName, nextScript: string) => void
  commitScriptDraft: () => void
  flushScriptDraftOnUnmount: (node: HTMLElement | null) => void
  updateHookSettingsPolicyDraft: (updates: HookSettingsPolicyDraft) => void
} {
  const [hookSettingsDraft, setHookSettingsDraft] = useState(() =>
    getHookSettingsDraft(repo.hookSettings)
  )
  const draftRef = useRef(hookSettingsDraft)
  draftRef.current = hookSettingsDraft
  const repoIdentityRef = useRef(repoHostIdentity)
  const dirtyRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)
  const persistRef = useRef(onUpdateHookSettings)
  persistRef.current = onUpdateHookSettings
  const persistForRepoRef = useRef(onUpdateHookSettings)

  const syncDraft = useCallback((next: RepoHookSettings) => {
    if (!areHookSettingsDraftsEqual(draftRef.current, next)) {
      draftRef.current = next
      setHookSettingsDraft(next)
    }
  }, [])

  const persistDraft = useCallback((next: RepoHookSettings) => {
    draftRef.current = next
    setHookSettingsDraft(next)
    dirtyRef.current = false
    persistRef.current(next)
  }, [])

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }, [])

  const flushScriptDraft = useCallback(
    (persist?: (settings: RepoHookSettings) => void) => {
      clearAutosaveTimer()
      if (!dirtyRef.current) {
        return
      }
      dirtyRef.current = false
      ;(persist ?? persistRef.current)(draftRef.current)
    },
    [clearAutosaveTimer]
  )

  const queueScriptDraftPersist = useCallback(() => {
    dirtyRef.current = true
    clearAutosaveTimer()
    // Why: persistence may cross SSH; coalesce typing instead of sending every character.
    autosaveTimerRef.current = window.setTimeout(flushScriptDraft, 700)
  }, [clearAutosaveTimer, flushScriptDraft])

  const updateScriptDraft = useCallback(
    (hookName: LocalHookName, nextScript: string) => {
      const current = draftRef.current
      const next: RepoHookSettings = {
        ...current,
        scripts: { ...current.scripts, [hookName]: nextScript }
      }
      draftRef.current = next
      setHookSettingsDraft(next)
      queueScriptDraftPersist()
    },
    [queueScriptDraftPersist]
  )

  const commitScriptDraft = useCallback(() => flushScriptDraft(), [flushScriptDraft])
  const flushScriptDraftOnUnmount = useCallback(
    (node: HTMLElement | null) => {
      if (node === null) {
        flushScriptDraft()
      }
    },
    [flushScriptDraft]
  )
  const updateHookSettingsPolicyDraft = useCallback(
    (updates: HookSettingsPolicyDraft) => persistDraft({ ...draftRef.current, ...updates }),
    [persistDraft]
  )

  // Why: a repository switch can unmount inputs before blur, so save through the prior updater.
  useEffect(() => {
    const next = getHookSettingsDraft(repo.hookSettings)
    if (repoIdentityRef.current === repoHostIdentity) {
      persistForRepoRef.current = onUpdateHookSettings
      if (!dirtyRef.current) {
        syncDraft(next)
      }
      return
    }
    flushScriptDraft(persistForRepoRef.current)
    repoIdentityRef.current = repoHostIdentity
    persistForRepoRef.current = onUpdateHookSettings
    draftRef.current = next
    setHookSettingsDraft(next)
  }, [flushScriptDraft, onUpdateHookSettings, repo.hookSettings, repoHostIdentity, syncDraft])

  return {
    hookSettingsDraft,
    updateScriptDraft,
    commitScriptDraft,
    flushScriptDraftOnUnmount,
    updateHookSettingsPolicyDraft
  }
}
