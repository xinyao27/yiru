import { pasteDraftWhenAgentReady } from '~renderer/components/terminal-pane/agent/draft-delivery'
import { agentDeliversDraftViaNativePrefill } from '~renderer/lib/agent-native-draft-prefill'
import type { TuiAgent } from '~shared/types'

export function deliverLaunchPromptToAgentTab(args: {
  tabId: string
  agent: TuiAgent
  content: string
  submit: boolean
  forcePaste: boolean
  timeoutMs?: number
  onTimeout?: () => void
}): Promise<boolean> {
  const { tabId, agent, content, submit, forcePaste, timeoutMs, onTimeout } = args
  // Why: native-prefill agents receive the prompt in their launch command, so
  // a skipped terminal paste is still a successful delivery.
  const deliversViaNativePrefill = agentDeliversDraftViaNativePrefill(agent, forcePaste)

  return pasteDraftWhenAgentReady({
    tabId,
    content,
    agent,
    submit,
    forcePaste,
    timeoutMs,
    onTimeout
  }).then((delivered) => {
    return delivered || deliversViaNativePrefill
  })
}
