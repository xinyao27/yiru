import React, { useCallback, useMemo } from 'react'

import {
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type { WorktreeCardProperty } from '../../../../shared/types'
import { getWorktreeCardPropertyOptions } from './sidebar-workspace-option-items'

export function WorktreeCardDisplayMenuSection(): React.JSX.Element {
  const worktreeCardProperties = useAppStore((s) => s.worktreeCardProperties)
  const setWorktreeCardProperties = useAppStore((s) => s.setWorktreeCardProperties)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const hasProjectGroups = projectGroups.length > 0
  const worktreeCardPropertyOptions = useMemo(
    () => getWorktreeCardPropertyOptions({ hasProjectGroups }),
    [hasProjectGroups]
  )
  const handleWorktreeCardPropertyChange = useCallback(
    (properties: readonly WorktreeCardProperty[], checked: boolean): void => {
      const next = checked
        ? [...worktreeCardProperties, ...properties]
        : worktreeCardProperties.filter((property) => !properties.includes(property))
      setWorktreeCardProperties(next)
    },
    [setWorktreeCardProperties, worktreeCardProperties]
  )

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex flex-1 items-center justify-between gap-3">
          {translate(
            'auto.components.sidebar.SidebarWorkspaceOptionsMenu.cardDisplay.title',
            'Card display'
          )}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {worktreeCardPropertyOptions.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.id}
            checked={opt.properties.every((property) => worktreeCardProperties.includes(property))}
            onCheckedChange={(checked) =>
              handleWorktreeCardPropertyChange(opt.properties, checked === true)
            }
            onClick={(event) => event.preventDefault()}
            closeOnClick={false}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
