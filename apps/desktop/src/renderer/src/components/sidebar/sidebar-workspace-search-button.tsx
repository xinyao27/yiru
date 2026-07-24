import { MagnifyingGlass as Search } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcutKeyComboDetails } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function SidebarWorkspaceSearchButton(): React.JSX.Element {
  // Why: this control moved outside SidebarNav's translation subscription into titlebar chrome.
  useTranslation()
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
            variant="quiet"
            size="icon-titlebar"
            type="button"
            onClick={() => openModal('worktree-palette')}
            aria-label={label}
            className="w-full [-webkit-app-region:no-drag]"
          >
            <Search weight="regular" />
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
