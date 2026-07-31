import { useEffect, useRef } from 'react'
import { resumeSleepingAgentSessionsForWorktree } from '~renderer/components/terminal-workspace/resume-sleeping-agent-session'
import { isWebRuntimeSessionActive } from '~renderer/runtime/web-runtime-session'
import { useAppStore } from '~renderer/store'

import { shouldAutoCreateInitialTerminal } from '../terminal/initial-terminal'
import { getActiveWorktreeRuntimeEnvironmentId } from './tab-model-lookup'

// Why: the two one-time-per-activation bootstrap effects — giving a freshly
// activated worktree a focusable tab, and resuming any sleeping agent
// sessions after startup hydration — share the same "run once per worktree
// activation" shape, so they live together rather than as loose effects in
// the panel component.
export function useWorktreeActivationBootstrap(): void {
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const hydrationSucceeded = useAppStore((s) => s.hydrationSucceeded)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const createTab = useAppStore((s) => s.createTab)
  const reconcileWorktreeTabModel = useAppStore((s) => s.reconcileWorktreeTabModel)

  // Auto-create first tab when worktree activates
  useEffect(() => {
    if (!workspaceSessionReady) {
      return
    }
    if (!activeWorktreeId) {
      return
    }
    // Why: in the paired web client, host session-tabs are authoritative.
    // Creating a local fallback races the host's initial terminal and duplicates tabs.
    if (isWebRuntimeSessionActive(getActiveWorktreeRuntimeEnvironmentId(activeWorktreeId))) {
      return
    }

    // Why: this fallback exists to give a newly activated/restored worktree a
    // focusable surface when the reconciled tab model has nothing renderable.
    // Re-running it on ordinary tab-count changes would recreate a terminal
    // immediately after the user intentionally closed the last visible one.
    const { renderableTabCount } = reconcileWorktreeTabModel(activeWorktreeId)
    if (!shouldAutoCreateInitialTerminal(renderableTabCount)) {
      return
    }
    // Why: this tab only exists because the user clicked a never-visited
    // worktree. Tag it so the PTY spawn it triggers does not count as
    // activity and reshuffle the sidebar. Explicit "New Tab" actions still
    // bump normally.
    createTab(activeWorktreeId, undefined, undefined, { pendingActivationSpawn: true })
  }, [workspaceSessionReady, activeWorktreeId, createTab, reconcileWorktreeTabModel])

  const startupResumeWorktreeIdsRef = useRef(new Set<string>())
  useEffect(() => {
    if (!workspaceSessionReady || !hydrationSucceeded || !activeWorktreeId) {
      return
    }
    if (startupResumeWorktreeIdsRef.current.has(activeWorktreeId)) {
      return
    }
    startupResumeWorktreeIdsRef.current.add(activeWorktreeId)
    // Why: startup hydration restores the active worktree without calling
    // activateAndRevealWorktree, so orphaned live/quit records need a terminal
    // surface pass after pane-level cold restore had first chance.
    resumeSleepingAgentSessionsForWorktree(activeWorktreeId)
  }, [activeWorktreeId, hydrationSucceeded, workspaceSessionReady])
}
