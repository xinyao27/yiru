import { normalizeSourceControlAiSettings } from '@yiru/runtime-protocol/workbench/source-control/ai'
import type { SourceControlAiSettingsPatch } from '@yiru/runtime-protocol/workbench/source-control/ai-types'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useRef, useState } from 'react'
import { registerWindowCloseGuard } from '~renderer/application-shell/window-close'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { useConfirmationDialog } from '~renderer/ui/confirmation-dialog'
import { isIntentionalAppRestartInProgress } from '~renderer/updates/before-unload'

type SourceControlPromptGuardInput = {
  closeSettingsPage: () => void
  settings: GlobalSettings | null
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<void>
}

export function useSourceControlPromptGuard({
  closeSettingsPage,
  settings,
  updateSettings
}: SourceControlPromptGuardInput) {
  const [hasUnsavedCommitPromptChanges, setHasUnsavedCommitPromptChanges] = useState(false)
  const [hasUnsavedBranchPromptChanges, setHasUnsavedBranchPromptChanges] = useState(false)
  const [discardSignal, setDiscardSignal] = useState(0)
  const confirm = useConfirmationDialog()
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())
  const hasUnsavedChanges = hasUnsavedCommitPromptChanges || hasUnsavedBranchPromptChanges
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  hasUnsavedChangesRef.current = hasUnsavedChanges

  const writeSettings = (patch: SourceControlAiSettingsPatch): Promise<void> => {
    const next = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const latestSettings = useAppStore.getState().settings ?? settings
        if (!latestSettings) {
          return
        }
        const latestConfig = normalizeSourceControlAiSettings(
          latestSettings.sourceControlAi,
          latestSettings.commitMessageAi
        )
        const resolvedPatch = typeof patch === 'function' ? patch(latestConfig) : patch
        await updateSettings({ sourceControlAi: { ...latestConfig, ...resolvedPatch } })
      })
    writeQueueRef.current = next
    return next
  }

  const promptDiscard = useEventCallback((): Promise<boolean> =>
    confirm({
      title: translate(
        'auto.components.settings.Settings.17bdee4ff1',
        'Discard unsaved Git AI Author changes?'
      ),
      description: translate(
        'auto.components.settings.Settings.43b68e10f0',
        'You have unsaved Git AI Author changes. Leaving will discard them.'
      ),
      confirmLabel: translate('auto.components.settings.Settings.65358016ea', 'Discard'),
      confirmVariant: 'destructive'
    })
  )

  const confirmDiscard = async (): Promise<boolean> => {
    if (!hasUnsavedChanges) {
      return true
    }
    const shouldDiscard = await promptDiscard()
    if (shouldDiscard) {
      setDiscardSignal((signal) => signal + 1)
      setHasUnsavedCommitPromptChanges(false)
      setHasUnsavedBranchPromptChanges(false)
    }
    return shouldDiscard
  }

  const closeWithGuard = useEventCallback(async (): Promise<void> => {
    if (await confirmDiscard()) {
      closeSettingsPage()
    }
  })

  useEffect(
    () =>
      registerWindowCloseGuard(() => {
        if (isIntentionalAppRestartInProgress() || !hasUnsavedChangesRef.current) {
          return true
        }
        return promptDiscard()
      }),
    [promptDiscard]
  )

  return {
    closeWithGuard,
    confirmDiscard,
    discardSignal,
    hasUnsavedBranchPromptChanges,
    hasUnsavedChanges,
    setHasUnsavedBranchPromptChanges,
    setHasUnsavedCommitPromptChanges,
    writeSettings
  }
}
