import React from 'react'
import { EyeSlash as EyeOff } from '~renderer/components/icons/hugeicons'
import { ContextMenuContent, ContextMenuItem } from '~renderer/components/ui/context-menu'
import { translate } from '~renderer/i18n/i18n'

export function HideSidebarMenu({ onHide }: { onHide: () => void }): React.JSX.Element {
  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={onHide}>
        <EyeOff className="size-3.5" />
        {translate('auto.components.sidebar.SidebarNav.d599269755', 'Hide from sidebar')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
