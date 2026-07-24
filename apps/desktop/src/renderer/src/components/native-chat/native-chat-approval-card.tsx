import { Shield as ShieldQuestion } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'

import type { ChatApproval } from './native-chat-interactive-prompt'
import { NATIVE_CHAT_CONTENT_WIDTH_CLASS } from './native-chat-layout'

export type NativeChatApprovalCardProps = {
  approval: ChatApproval
  /** Send the chosen option's literal string to the agent's PTY. */
  onChoose: (send: string) => void
}

/**
 * Native renderer for an agent tool-approval (PermissionRequest) as an
 * Allow/Deny card. Each button writes its option's literal `send` string back
 * to the agent (a number to allow; ESC to deny). The first option reads as the
 * affirmative action and gets the primary styling.
 */
export function NativeChatApprovalCard({
  approval,
  onChoose
}: NativeChatApprovalCardProps): React.JSX.Element {
  return (
    <div className="shrink-0">
      <div className="px-3 pt-2 pb-1 sm:px-4">
        <div className={cn('pointer-events-auto mx-auto w-full', NATIVE_CHAT_CONTENT_WIDTH_CLASS)}>
          <div className="border-input bg-card flex w-full flex-col gap-2 border px-4 py-3">
            <div className="flex items-start gap-2">
              <ShieldQuestion className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold">{approval.title}</p>
                {approval.detail ? (
                  <p className="text-muted-foreground mt-0.5 font-mono text-xs break-words">
                    {approval.detail}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {approval.options.map((opt, i) => (
                <Button
                  variant={i === 0 ? 'default' : 'outline'}
                  size="sm"
                  key={`${opt.label}-${i}`}
                  type="button"
                  onClick={() => onChoose(opt.send)}
                  className="h-auto px-4 py-1.5 font-semibold"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
