import { toast } from 'sonner'

import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { Button } from '@/components/ui/button'
import { useShortcutKeyDetails, type ShortcutKeyComboDetails } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { resolveDefaultAgentForNewTab } from '@/lib/agent-tab-shortcuts'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { requestGlobalAssistant } from '@/lib/global-assistant'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'

import logo from '../../../../../resources/yiru-wordmark.png?url'
import { getKeybindingDefinition, type KeybindingActionId } from '../../../../shared/keybindings'

type WorkspacePanelShortcutHint = {
  actionId: KeybindingActionId
  shortcut: ShortcutKeyComboDetails
  onClick: () => void
}

function getShortcutTitle(actionId: KeybindingActionId): string {
  return getKeybindingDefinition(actionId)?.title ?? actionId
}

export function WorkspacePanelEditorEmptyState({
  worktreeId,
  groupId,
  onNewTerminalTab,
  onNewBrowserTab
}: {
  worktreeId: string
  groupId: string
  onNewTerminalTab: () => void
  onNewBrowserTab: () => void
}): React.JSX.Element {
  const createWorkspaceShortcut = useShortcutKeyDetails('workspace.create')
  const switchWorkspaceShortcut = useShortcutKeyDetails('worktree.palette')
  const newAgentShortcut = useShortcutKeyDetails('tab.newAgent')
  const newTerminalShortcut = useShortcutKeyDetails('tab.newTerminal')
  const goToFileShortcut = useShortcutKeyDetails('worktree.quickOpen')
  const openBrowserShortcut = useShortcutKeyDetails('tab.newBrowser')
  const toggleAssistantShortcut = useShortcutKeyDetails('assistant.toggle')

  const openModal = useAppStore((state) => state.openModal)
  const launchDefaultAgent = (): void => {
    const state = useAppStore.getState()
    const connectionId = getConnectionIdFromState(state, worktreeId)
    const agent = resolveDefaultAgentForNewTab({
      defaultTuiAgent: state.settings?.defaultTuiAgent,
      detectedAgentIds:
        typeof connectionId === 'string'
          ? state.remoteDetectedAgentIds[connectionId]
          : state.detectedAgentIds,
      disabledTuiAgents: state.settings?.disabledTuiAgents
    })
    if (!agent) {
      toast.message(
        translate(
          'auto.components.WorkspacePanelEditorEmptyState.noAgent',
          'No agent CLI detected — install one or pick a default agent in Settings.'
        )
      )
      return
    }
    if (
      !launchAgentInNewTab({
        agent,
        worktreeId,
        groupId,
        launchSource: 'tab_bar_quick_launch'
      })
    ) {
      toast.error(
        translate(
          'auto.components.WorkspacePanelEditorEmptyState.agentLaunchFailed',
          'Could not start {{value0}}.',
          { value0: agent }
        )
      )
    }
  }

  const hints = (
    [
      {
        actionId: 'workspace.create',
        shortcut: createWorkspaceShortcut,
        onClick: () =>
          openModal('new-workspace-composer', {
            telemetrySource: 'unknown'
          })
      },
      {
        actionId: 'worktree.palette',
        shortcut: switchWorkspaceShortcut,
        onClick: () => openModal('worktree-palette')
      },
      {
        actionId: 'tab.newAgent',
        shortcut: newAgentShortcut,
        onClick: launchDefaultAgent
      },
      {
        actionId: 'tab.newTerminal',
        shortcut: newTerminalShortcut,
        onClick: onNewTerminalTab
      },
      {
        actionId: 'worktree.quickOpen',
        shortcut: goToFileShortcut,
        onClick: () => openModal('quick-open')
      },
      {
        actionId: 'tab.newBrowser',
        shortcut: openBrowserShortcut,
        onClick: onNewBrowserTab
      },
      {
        actionId: 'assistant.toggle',
        shortcut: toggleAssistantShortcut,
        onClick: () => requestGlobalAssistant()
      }
    ] satisfies WorkspacePanelShortcutHint[]
  ).filter((hint) => hint.shortcut.keys.length > 0)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden px-4">
      <div className="text-muted-foreground/50 w-full max-w-52">
        <img
          src={logo}
          alt=""
          aria-hidden
          className="mx-auto mb-7 h-auto w-28 opacity-15 brightness-0 dark:invert"
        />
        <ul className="space-y-2 text-xs">
          {hints.map((hint) => (
            <li key={hint.actionId}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="w-full justify-between"
                onClick={hint.onClick}
              >
                <span className="truncate">{getShortcutTitle(hint.actionId)}</span>
                <ShortcutKeyCombo
                  keys={hint.shortcut.keys}
                  doubleTap={hint.shortcut.doubleTap}
                  className="opacity-60"
                  keyCapClassName="min-w-5 px-1 py-0 text-[10px]"
                  separatorClassName="text-[9px]"
                />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
