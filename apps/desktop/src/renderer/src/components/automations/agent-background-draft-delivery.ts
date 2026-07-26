import { pasteDraftWhenAgentReady } from '@/components/native-chat/agent-paste-draft'
import { showAutomationPromptNotSentToast } from '@/lib/agent-background-session-timeout-toast'

import type { TuiAgent } from '../../../../shared/types'

export function scheduleAgentBackgroundDraft(
  tabId: string,
  content: string,
  agent: TuiAgent
): void {
  void pasteDraftWhenAgentReady({
    tabId,
    content,
    agent,
    submit: true,
    onTimeout: () => showAutomationPromptNotSentToast(agent)
  })
}
