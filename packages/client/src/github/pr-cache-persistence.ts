import { shellClient } from '~renderer/runtime/shell-client'
import type { AppState } from '~renderer/store/types'

let saveTimer: ReturnType<typeof setTimeout> | null = null

export function saveGitHubPRCache(state: AppState): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    shellClient.cache.setGitHub({ cache: { pr: state.prCache } })
  }, 1000)
}
