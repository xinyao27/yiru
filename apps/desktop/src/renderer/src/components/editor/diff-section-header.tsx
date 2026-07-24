import {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  ArrowSquareOut as ExternalLink
} from '@phosphor-icons/react'
import type { MouseEvent, ReactElement, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function DiffSectionHeader({
  path,
  dirty,
  collapsed,
  added,
  removed,
  onToggle,
  onOpenSection,
  openSectionTitle,
  trailingContent
}: {
  path: string
  dirty: boolean
  collapsed: boolean
  added: number
  removed: number
  onToggle: () => void
  onOpenSection: (event: MouseEvent) => void
  openSectionTitle: string
  trailingContent?: ReactNode
}): ReactElement {
  return (
    <div
      className="bg-background hover:bg-accent group sticky top-0 z-10 flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-xs transition-colors"
      onClick={onToggle}
    >
      <span className="text-muted-foreground min-w-0 flex-1 truncate">
        <span
          role="button"
          tabIndex={0}
          className="cursor-copy outline-none hover:underline focus-visible:underline"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            // Why: stop both mouse-down and click on the path affordance so
            // the parent section-toggle row cannot consume the interaction.
            void window.api.ui.writeClipboardText(path).catch((error) => {
              console.error('Failed to copy diff path:', error)
            })
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            void window.api.ui.writeClipboardText(path).catch((error) => {
              console.error('Failed to copy diff path:', error)
            })
          }}
          title={translate('auto.components.editor.DiffSectionHeader.8915726e93', 'Copy path')}
        >
          {path}
        </span>
        {dirty && <span className="ml-1 font-medium">M</span>}
        {(added > 0 || removed > 0) && (
          <span className="ml-2 tabular-nums">
            {added > 0 && <span className="text-green-600 dark:text-green-500">+{added}</span>}
            {added > 0 && removed > 0 && <span> </span>}
            {removed > 0 && <span className="text-red-500">-{removed}</span>}
          </span>
        )}
      </span>
      <div className="ml-2 flex shrink-0 items-center gap-1">
        {trailingContent}
        <Button
          variant="quiet"
          size="xs"
          className="can-hover:opacity-0 h-auto w-auto p-0.5 transition-opacity group-hover:opacity-100"
          onClick={onOpenSection}
          title={openSectionTitle}
        >
          <ExternalLink weight="regular" className="size-3.5" />
        </Button>
        {collapsed ? (
          <ChevronRight weight="regular" className="text-muted-foreground size-3.5 shrink-0" />
        ) : (
          <ChevronDown weight="regular" className="text-muted-foreground size-3.5 shrink-0" />
        )}
      </div>
    </div>
  )
}
