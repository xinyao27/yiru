import React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type SavedInProjectSettingsToastProps = {
  onOpenSettings: () => void
}

function SavedInProjectSettingsToast({
  onOpenSettings
}: SavedInProjectSettingsToastProps): React.JSX.Element {
  return (
    <span>
      {translate('auto.components.sidebar.SetupScriptPromptCard.a5bb8c5135', 'Saved in this')}{' '}
      <Button
        variant="ghost"
        size="xs"
        type="button"
        className="hover:text-foreground h-auto border-0 p-0 underline underline-offset-2"
        onClick={onOpenSettings}
      >
        {translate(
          'auto.components.sidebar.SetupScriptPromptCard.d9f2db2738',
          "project's settings"
        )}
      </Button>
    </span>
  )
}

export function showSavedInProjectSettingsToast(input: {
  onOpenSettings: () => void
  description?: React.ReactNode
}): void {
  // Why: the save confirmation is also the fastest path back to the exact
  // local setup editor the user just changed.
  toast.success(<SavedInProjectSettingsToast onOpenSettings={input.onOpenSettings} />, {
    description: input.description
  })
}
