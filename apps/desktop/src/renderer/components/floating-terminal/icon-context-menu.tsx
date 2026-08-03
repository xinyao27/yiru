import {
  EyeSlash as EyeOff,
  Layout as PanelBottom,
  Layout as PanelTop
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '~renderer/components/ui/context-menu'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import type { FloatingTerminalTriggerLocation } from '~shared/types'

type FloatingTerminalIconContextMenuProps = {
  children: React.ReactNode
  currentLocation: FloatingTerminalTriggerLocation
  className?: string
  style?: React.CSSProperties
}

export function FloatingTerminalIconContextMenu({
  children,
  currentLocation,
  className,
  style
}: FloatingTerminalIconContextMenuProps): React.JSX.Element {
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)

  const moveAction = useMemo(() => {
    if (currentLocation === 'floating-button') {
      return {
        icon: <PanelBottom className="size-3.5" />,
        label: translate(
          'auto.components.floating.terminal.FloatingTerminalIconContextMenu.0ee79e0674',
          'Move to Status Bar'
        ),
        location: 'status-bar' as const
      }
    }
    return {
      icon: <PanelTop className="size-3.5" />,
      label: translate(
        'auto.components.floating.terminal.FloatingTerminalIconContextMenu.763f5fa2c1',
        'Move to Floating Button'
      ),
      location: 'floating-button' as const
    }
  }, [currentLocation])

  return (
    <ContextMenu open={open} onOpenChange={setOpen}>
      {/* Why: the status bar behind this icon is also a trigger; Base UI stops
          the event at the inner one, so only this menu opens. */}
      <ContextMenuTrigger
        render={
          <span className={className} style={style} data-floating-terminal-toggle>
            {children}
          </span>
        }
      />
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            void updateSettings({ floatingTerminalTriggerLocation: moveAction.location })
          }}
        >
          {moveAction.icon}
          {moveAction.label}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            useAppStore.getState().recordFeatureInteraction('floating-workspace-hidden')
            void updateSettings({ floatingTerminalEnabled: false })
          }}
        >
          <EyeOff className="size-3.5" />
          {translate(
            'auto.components.floating.terminal.FloatingTerminalIconContextMenu.8e7d775287',
            'Hide Floating Workspace'
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
