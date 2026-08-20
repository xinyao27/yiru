import { useMemo } from 'react'
import {
  buildCmdJActionResults,
  buildCmdJSettingsResults,
  rankCmdJMiddleResults
} from '~renderer/components/cmd-j/palette-results'
import type { CmdJQuickActionContext } from '~renderer/components/cmd-j/quick-action-context'
import { getCmdJQuickActions } from '~renderer/components/cmd-j/quick-actions'

import type { QuickActionPaletteItem, SettingsPaletteItem } from './types'
import type { PaletteStoreState } from './use-palette-store-state'

type SecondaryResultsInput = Pick<PaletteStoreState, 'settingsSections'> & {
  deferredQuery: string
  quickActionContext: CmdJQuickActionContext
}

// Why: Settings and Quick Action results are ranked together into one middle
// section — keeping their build + availability filtering + ranking together
// avoids threading the raw settings/action lists through the render layer.
export function usePaletteSecondaryResults(input: SecondaryResultsInput) {
  const { settingsSections, deferredQuery, quickActionContext } = input

  const settingsResults = useMemo(
    () => buildCmdJSettingsResults(settingsSections),
    [settingsSections]
  )
  const actionResults = useMemo(() => buildCmdJActionResults(getCmdJQuickActions()), [])

  const middleItems = useMemo<(SettingsPaletteItem | QuickActionPaletteItem)[]>(
    () =>
      rankCmdJMiddleResults({
        query: deferredQuery,
        settingsResults,
        actionResults: actionResults.filter(
          (action) => action.isAvailable(quickActionContext).available
        )
      }).map((result) =>
        result.kind === 'settings'
          ? { id: result.id, type: 'settings' as const, result }
          : { id: `quick-action:${result.id}`, type: 'quick-action' as const, result }
      ),
    [actionResults, deferredQuery, quickActionContext, settingsResults]
  )

  return { middleItems, hasAnyMiddleResults: middleItems.length > 0 }
}
