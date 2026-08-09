import { MagnifyingGlass as Search } from '@phosphor-icons/react'
import type { ComponentProps } from 'react'
import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { useShortcutKeyComboDetails } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { cn } from '~renderer/lib/class-names'
import { useAppStore } from '~renderer/store'

type SidebarWorkspaceSearchButtonProps = {
  variant?: ComponentProps<typeof Button>['variant']
  // Why: titlebar cluster gives search the flexible middle slot between
  // sidebar toggle and history arrows; the icon stays centered in that region.
  stretch?: boolean
}

export function SidebarWorkspaceSearchButton({
  variant = 'quiet',
  stretch = false
}: SidebarWorkspaceSearchButtonProps): React.JSX.Element {
  // Why: this control moved outside SidebarNav's translation subscription into titlebar chrome.
  useUiLocale()
  const worktreePaletteShortcutCombos = useShortcutKeyComboDetails('worktree.palette')
  const openModal = useAppStore((state) => state.openModal)

  const label = translate(
    'auto.components.sidebar.SidebarNav.0c3395fd32',
    'Search worktrees and browser tabs'
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size="icon-titlebar"
            type="button"
            onClick={() => openModal('worktree-palette')}
            aria-label={label}
            className={cn('[-webkit-app-region:no-drag]', stretch && 'w-full min-w-0 flex-1')}
          >
            <Search />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        <span className="flex items-center gap-2">
          {translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
          {/* Why: shortcuts stay discoverable without occupying persistent titlebar space. */}
          <span className="flex items-center gap-1.5">
            {worktreePaletteShortcutCombos.map((combo) => (
              <ShortcutKeyCombo
                key={combo.keys.join('-')}
                keys={combo.keys}
                doubleTap={combo.doubleTap}
                variant="inverted"
              />
            ))}
          </span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
