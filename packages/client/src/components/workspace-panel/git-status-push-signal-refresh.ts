import { useEffect, useRef } from 'react'
import {
  YIRU_TERMINAL_COMMAND_FINISHED_EVENT,
  type TerminalCommandFinishedEventDetail
} from '~renderer/hooks/terminal-command-finished-event'
import { isWindowVisible } from '~renderer/lib/window-visibility-interval'
import { worktreeHostClient } from '~renderer/runtime/worktree-host-client'

type UseGitStatusPushSignalRefreshParams = {
  activeRepoId: string | null
  activeWorktreeId: string | null
  enabled: boolean
  fetchStatus: () => void
}

// Why: these push signals close the latency gap left by the slow terminal-only
// fallback poll — branch switches and commits made inside shells surface at
// the coalescer's floor instead of waiting out the fallback cadence. Bursts
// are safe: the main-process watcher debounces and fetchStatus feeds a
// coalesced runner with a minimum interval.
export function useGitStatusPushSignalRefresh({
  activeRepoId,
  activeWorktreeId,
  enabled,
  fetchStatus
}: UseGitStatusPushSignalRefreshParams): void {
  const fetchStatusRef = useRef(fetchStatus)
  fetchStatusRef.current = fetchStatus

  useEffect(() => {
    if (!enabled || !activeRepoId) {
      return
    }
    const handleRepoSignal = ({ repoId }: { repoId: string }): void => {
      if (repoId !== activeRepoId || !isWindowVisible()) {
        return
      }
      fetchStatusRef.current()
    }
    // Repo metadata changed on disk. Hidden windows skip the nudge; the
    // visibility interval refreshes immediately on reveal.
    const unsubs = [
      worktreeHostClient.onChanged(handleRepoSignal),
      worktreeHostClient.onGitStatusMetadataChanged(handleRepoSignal)
    ]
    return () => {
      for (const unsubscribe of unsubs) {
        unsubscribe()
      }
    }
  }, [enabled, activeRepoId])

  useEffect(() => {
    if (!enabled || !activeWorktreeId) {
      return
    }
    const handleCommandFinished = (event: Event): void => {
      const detail = (event as CustomEvent<TerminalCommandFinishedEventDetail>).detail
      if (detail?.worktreeId !== activeWorktreeId || !isWindowVisible()) {
        return
      }
      fetchStatusRef.current()
    }
    window.addEventListener(YIRU_TERMINAL_COMMAND_FINISHED_EVENT, handleCommandFinished)
    return () => {
      window.removeEventListener(YIRU_TERMINAL_COMMAND_FINISHED_EVENT, handleCommandFinished)
    }
  }, [enabled, activeWorktreeId])
}
