import { useAppStore } from '~renderer/store/state'

import {
  cancelCommandCodeDoneSettle,
  openCommandCodeDoneSettle,
  setCommandCodeDoneSettleExecutor
} from '../command-code-done-settle'

type CommandCodeStatusOptions = {
  paneKey: string
  tabId: string
  paneId: number
}

export type CommandCodeStatus = {
  seedWorking: (prompt: string) => void
  scheduleDone: (prompt: string) => void
  dispose: () => void
}

export function createCommandCodeStatus(options: CommandCodeStatusOptions): CommandCodeStatus {
  const settleDone = (normalizedPrompt: string): void => {
    const state = useAppStore.getState()
    const entry = state.agentStatusByPaneKey[options.paneKey]
    if (entry?.agentType !== 'command-code' || entry.state !== 'working') {
      return
    }
    const currentPrompt = entry.prompt.trim()
    if (currentPrompt && currentPrompt !== normalizedPrompt) {
      return
    }
    const currentTitle = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
    state.setAgentStatus(
      options.paneKey,
      {
        state: 'done',
        prompt: currentPrompt || normalizedPrompt,
        agentType: 'command-code'
      },
      currentTitle
    )
  }
  const releaseExecutor = setCommandCodeDoneSettleExecutor(options.paneKey, settleDone)

  return {
    seedWorking: (prompt) => {
      cancelCommandCodeDoneSettle(options.paneKey)
      const state = useAppStore.getState()
      const entry = state.agentStatusByPaneKey[options.paneKey]
      const currentTitle = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
      const normalizedPrompt = prompt.trim()
      if (
        entry?.agentType === 'command-code' &&
        entry.state === 'done' &&
        (!normalizedPrompt || normalizedPrompt === entry.prompt.trim())
      ) {
        return
      }
      state.setAgentStatus(
        options.paneKey,
        {
          state: 'working',
          prompt: normalizedPrompt || (entry?.state === 'working' ? entry.prompt : ''),
          agentType: 'command-code'
        },
        currentTitle
      )
    },
    scheduleDone: (prompt) => {
      const normalizedPrompt = prompt.trim()
      if (!normalizedPrompt) {
        cancelCommandCodeDoneSettle(options.paneKey)
        return
      }
      openCommandCodeDoneSettle(options.paneKey, normalizedPrompt)
    },
    dispose: releaseExecutor
  }
}
