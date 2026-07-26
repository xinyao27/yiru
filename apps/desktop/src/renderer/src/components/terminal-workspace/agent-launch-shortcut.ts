import { listBoundAgentTabActions, resolveDefaultAgentForNewTab } from '@/lib/agent-tab-shortcuts'

import type { KeybindingActionId } from '../../../../shared/keybindings'
import type { TuiAgent } from '../../../../shared/types'
import { getConnectionId } from '../../lib/connection-context'
import { useAppStore } from '../../store'

type AgentLaunchShortcutMatch = {
  agentActionId: KeybindingActionId
  agentToLaunch: TuiAgent | null
}

// Why: Cmd/Ctrl+Alt+T launches the default agent; per-agent chords (Settings
// → Shortcuts → Agents) launch their specific agent instead. Both share the
// same "which action chord matched, which agent does it resolve to" lookup,
// so it is one pure function rather than duplicated inline in the keydown
// handler.
export function resolveAgentLaunchShortcut(
  activeWorktreeId: string,
  matchShortcut: (actionId: KeybindingActionId) => boolean
): AgentLaunchShortcutMatch | null {
  const state = useAppStore.getState()
  if (matchShortcut('tab.newAgent')) {
    const connectionId = getConnectionId(activeWorktreeId)
    return {
      agentActionId: 'tab.newAgent',
      agentToLaunch: resolveDefaultAgentForNewTab({
        defaultTuiAgent: state.settings?.defaultTuiAgent,
        detectedAgentIds:
          typeof connectionId === 'string'
            ? state.remoteDetectedAgentIds[connectionId]
            : state.detectedAgentIds,
        disabledTuiAgents: state.settings?.disabledTuiAgents
      })
    }
  }
  for (const bound of listBoundAgentTabActions(
    state.keybindings,
    state.settings?.disabledTuiAgents
  )) {
    if (matchShortcut(bound.actionId)) {
      // Why: a per-agent chord is an explicit request for that agent, so
      // launch it even when detection hasn't (or can't have) confirmed the
      // binary; a missing CLI fails visibly in the tab.
      return { agentActionId: bound.actionId, agentToLaunch: bound.agent }
    }
  }
  return null
}
