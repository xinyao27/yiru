import React from 'react'

import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { AutomationDraft } from './automation-editor-dialog'
import { Field } from './automation-page-parts'
import { AutomationPrecheckFields } from './automation-precheck-fields'

type AutomationEditorPromptSectionProps = {
  draft: AutomationDraft
  isHermesCreate: boolean
  pickerTriggerClassName: string
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

export function AutomationEditorPromptSection({
  draft,
  isHermesCreate,
  pickerTriggerClassName,
  onDraftChange
}: AutomationEditorPromptSectionProps): React.JSX.Element {
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto px-5 py-4">
      {draft.scheduleWarning ? (
        <div className="border-border bg-muted/40 text-muted-foreground mb-3 border px-3 py-2 text-xs">
          {draft.scheduleWarning}
        </div>
      ) : null}
      <Field
        label={translate('auto.components.automations.AutomationEditorDialog.058c23cb3f', 'Prompt')}
      >
        <Textarea
          value={draft.prompt}
          placeholder={translate(
            'auto.components.automations.AutomationEditorDialog.6d778190b7',
            'Run the weekly dependency audit and summarize risky changes.'
          )}
          onChange={(event) =>
            onDraftChange((current) => ({ ...current, prompt: event.target.value }))
          }
          className="min-h-[260px] resize-none"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          {translate(
            'auto.components.automations.AutomationEditorDialog.827b25a81e',
            'Supports skills, file paths, and built-in commands like'
          )}{' '}
          <code className="bg-muted px-1 font-mono text-[11px]">
            {translate('auto.components.automations.AutomationEditorDialog.a4ac8fcc62', '/goal')}
          </code>
          .
        </p>
      </Field>
      {/* Why: the Yiru/Hermes target toggle changes form height; collapsing the
          Yiru-only precheck row keeps the dialog from snapping vertically. */}
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          isHermesCreate ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        )}
        aria-hidden={isHermesCreate}
        inert={isHermesCreate}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'mt-3 grid gap-3 transition-[opacity,transform] duration-150 ease-out sm:grid-cols-[minmax(0,1fr)_9rem]',
              isHermesCreate
                ? '-translate-y-1 opacity-0 delay-0'
                : 'translate-y-0 opacity-100 delay-200'
            )}
          >
            <AutomationPrecheckFields
              draft={draft}
              disabled={isHermesCreate}
              pickerTriggerClassName={pickerTriggerClassName}
              onDraftChange={onDraftChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
