import type { ManagedPane } from '~renderer/lib/pane-manager/pane-manager'
import { runQuickCommandInNewTab } from '~renderer/lib/run-quick-command-in-new-tab'
import { isTerminalAgentQuickCommand } from '~shared/terminal/quick-commands'
import type { TerminalQuickCommand } from '~shared/types'

import type { AgentSessionContinuationRequest } from './agent/session-continuation'
import type { PtyTransport } from './pty/transport-types'
import type { PaneCwdMap } from './resolve-split-cwd'
import { prepareAgentSessionContinuationFromPane } from './terminal-agent-session-continuation'
import {
  copyAgentSessionContextFromPane,
  prepareAgentSessionForkFromPane,
  type PreparedAgentSessionFork
} from './terminal-agent-session-fork'
import { sendTerminalQuickCommandToPane } from './terminal-quick-command-dispatch'

type TerminalContextMenuAgentActions = {
  onContinueAgentSessionInNewSession: () => void
  onCopyAgentSessionContext: () => Promise<void>
  onForkAgentSession: () => Promise<void>
  onQuickCommand: (command: TerminalQuickCommand) => void
  onRelaunchAgentSession: () => void
}

export function createTerminalContextMenuAgentActions({
  fallbackCwd,
  groupId,
  onAgentSessionContinuationReady,
  onAgentSessionForkReady,
  paneCwdRef,
  paneTransportsRef,
  resolveMenuPane,
  tabId,
  worktreeId
}: {
  fallbackCwd: string
  groupId: string | null
  onAgentSessionContinuationReady: (request: AgentSessionContinuationRequest) => void
  onAgentSessionForkReady: (fork: PreparedAgentSessionFork) => void
  paneCwdRef: React.RefObject<PaneCwdMap>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  resolveMenuPane: () => ManagedPane | null
  tabId: string
  worktreeId: string
}): TerminalContextMenuAgentActions {
  const prepareContinuation = (requireContext: boolean): void => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const request = prepareAgentSessionContinuationFromPane({
      pane,
      tabId,
      worktreeId,
      groupId,
      workspacePath: fallbackCwd,
      initialCwd: paneCwdRef.current.get(pane.id)?.cwd || fallbackCwd,
      requireContext
    })
    if (request) {
      onAgentSessionContinuationReady(request)
    }
  }

  return {
    onForkAgentSession: async () => {
      const pane = resolveMenuPane()
      if (!pane) {
        return
      }
      const fork = prepareAgentSessionForkFromPane({ pane, tabId, worktreeId, groupId })
      if (fork) {
        onAgentSessionForkReady(fork)
      }
    },
    onContinueAgentSessionInNewSession: () => prepareContinuation(true),
    // Why: model relaunch is valid before a session has context to hand off.
    onRelaunchAgentSession: () => prepareContinuation(false),
    onCopyAgentSessionContext: async () => {
      const pane = resolveMenuPane()
      if (pane) {
        await copyAgentSessionContextFromPane(pane)
      }
    },
    onQuickCommand: (command) => {
      if (isTerminalAgentQuickCommand(command)) {
        runQuickCommandInNewTab({ command, worktreeId, groupId })
        return
      }
      const pane = resolveMenuPane()
      if (pane) {
        sendTerminalQuickCommandToPane({
          command,
          pane,
          tabId,
          transport: paneTransportsRef.current.get(pane.id)
        })
      }
    }
  }
}
