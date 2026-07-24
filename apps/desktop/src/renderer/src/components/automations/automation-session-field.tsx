import { Info } from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

import type { AutomationDraft } from './automation-editor-dialog'
import { Field } from './automation-page-parts'

type AutomationSessionFieldProps = {
  draft: AutomationDraft
  toggleItemClassName: string
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

export function AutomationSessionField({
  draft,
  toggleItemClassName,
  onDraftChange
}: AutomationSessionFieldProps): React.JSX.Element {
  return (
    <Field
      label={
        <span className="inline-flex items-center gap-1">
          {translate('auto.components.automations.AutomationSessionField.5ad314118e', 'Session')}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="quiet"
                  size="xs"
                  type="button"
                  aria-label={translate(
                    'auto.components.automations.AutomationSessionField.4bdce31f37',
                    'Session reuse help'
                  )}
                  className="h-auto border-0 p-0"
                >
                  <Info className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={6} className="max-w-72">
              {translate(
                'auto.components.automations.AutomationSessionField.b675112193',
                'Reuse sends future runs to the previous live automation session. If that session is gone, Yiru starts a fresh one.'
              )}
            </TooltipContent>
          </Tooltip>
        </span>
      }
    >
      <ToggleGroup
        value={[draft.workspaceMode === 'existing' && draft.reuseSession ? 'reuse' : 'fresh']}
        onValueChange={([value]) => {
          if (!value) {
            return
          }
          onDraftChange((current) => ({
            ...current,
            reuseSession: value === 'reuse',
            workspaceMode: value === 'reuse' ? 'existing' : current.workspaceMode
          }))
        }}
        variant="outline"
        size="sm"
        className="grid w-full grid-cols-2"
      >
        <ToggleGroupItem value="fresh" className={toggleItemClassName}>
          {translate('auto.components.automations.AutomationSessionField.c90888ee94', 'Fresh')}
        </ToggleGroupItem>
        <ToggleGroupItem value="reuse" className={toggleItemClassName}>
          {translate('auto.components.automations.AutomationSessionField.f3c76dce51', 'Reuse')}
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  )
}
