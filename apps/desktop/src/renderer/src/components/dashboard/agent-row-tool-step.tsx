import { Wrench } from '@phosphor-icons/react'

import { cn } from '@/lib/class-names'

type DashboardAgentRowToolStepProps = {
  expanded: boolean
  isWorking: boolean
  toolName: string
  toolInput: string
}

export function DashboardAgentRowToolStep({
  expanded,
  isWorking,
  toolName,
  toolInput
}: DashboardAgentRowToolStepProps): React.JSX.Element | null {
  if (!isWorking) {
    return null
  }

  return (
    <div
      data-agent-row-tool-slot=""
      className="text-muted-foreground/70 mt-0.5 min-w-0 pl-5 text-[10px] leading-snug"
    >
      {toolName ? (
        <>
          <div
            data-agent-row-tool-header="true"
            className={cn(
              'flex h-[1lh] min-w-0 items-center gap-1',
              !expanded && 'overflow-hidden'
            )}
          >
            <Wrench className="size-2.5 shrink-0" />
            <code className="shrink-0 font-mono text-[10px]">{toolName}</code>
            {!expanded && toolInput ? (
              <span className="text-muted-foreground/60 min-w-0 truncate" title={toolInput}>
                {toolInput}
              </span>
            ) : null}
          </div>
          {toolInput ? (
            <div
              className={cn(
                'grid transition-[grid-template-rows,margin-top] duration-200 ease-out',
                expanded ? 'mt-0.5 grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}
            >
              <pre className="text-muted-foreground/60 min-h-0 overflow-hidden font-mono text-[10px] break-words whitespace-pre-wrap">
                {toolInput}
              </pre>
            </div>
          ) : null}
        </>
      ) : (
        <span data-agent-row-tool-placeholder="true" aria-hidden className="block h-[1lh]" />
      )}
    </div>
  )
}
