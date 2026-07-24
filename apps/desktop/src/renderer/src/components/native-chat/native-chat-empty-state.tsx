import { Chat as MessageSquare, Warning as TriangleAlert } from '@phosphor-icons/react'
import { NATIVE_CHAT_EMPTY_STATE_COPY } from '@yiru/workbench-model/agent'
import type { NativeChatSession } from '@yiru/workbench-model/agent'

import { translate } from '@/i18n/i18n'
import { formatAgentTypeLabel } from '@/lib/agent-status'

export function NativeChatEmptyState({
  kind,
  message,
  agent
}: {
  kind: 'loading' | 'empty' | 'error' | 'not-agent'
  message?: string
  agent?: NativeChatSession['agent']
}): React.JSX.Element {
  const copy = emptyStateCopy(kind, message, agent)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className={
          kind === 'error'
            ? 'bg-destructive/10 text-destructive flex size-12 items-center justify-center'
            : 'bg-accent text-accent-foreground flex size-12 items-center justify-center'
        }
      >
        {kind === 'error' ? (
          <TriangleAlert className="size-6" />
        ) : (
          <MessageSquare className="size-6" />
        )}
      </div>
      <p className="text-foreground text-sm font-medium">{copy.title}</p>
      {copy.subtitle ? (
        <p className="text-muted-foreground max-w-sm text-xs text-balance">{copy.subtitle}</p>
      ) : null}
    </div>
  )
}

function emptyStateCopy(
  kind: 'loading' | 'empty' | 'error' | 'not-agent',
  message?: string,
  agent?: NativeChatSession['agent']
): { title: string; subtitle: string | null } {
  switch (kind) {
    case 'loading':
      return {
        title: translate(
          'components.native-chat.state.loading.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.loading.title
        ),
        subtitle: translate(
          'components.native-chat.state.loading.subtitle',
          NATIVE_CHAT_EMPTY_STATE_COPY.loading.subtitle
        )
      }
    case 'error':
      return {
        title: translate(
          'components.native-chat.state.error.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.error.title
        ),
        subtitle:
          message ??
          translate(
            'components.native-chat.state.error.subtitle',
            NATIVE_CHAT_EMPTY_STATE_COPY.error.subtitle
          )
      }
    case 'not-agent':
      return {
        title: translate(
          'components.native-chat.state.notAgent.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.notAgent.title
        ),
        subtitle: translate(
          'components.native-chat.state.notAgent.subtitle',
          NATIVE_CHAT_EMPTY_STATE_COPY.notAgent.subtitle
        )
      }
    case 'empty': {
      const agentName = agent ? formatAgentTypeLabel(agent) : 'the agent'
      return {
        title: translate(
          'components.native-chat.state.empty.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.empty.title,
          { value0: agentName }
        ),
        subtitle: translate(
          'components.native-chat.state.empty.subtitle',
          NATIVE_CHAT_EMPTY_STATE_COPY.empty.subtitle,
          { value0: agentName }
        )
      }
    }
  }
}
