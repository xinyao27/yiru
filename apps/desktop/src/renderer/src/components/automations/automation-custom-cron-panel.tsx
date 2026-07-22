import { CheckCircle as CheckCircle2, WarningCircle as CircleAlert } from '@phosphor-icons/react'
import React from 'react'

import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import {
  formatAutomationSchedule,
  getAutomationCronExpressionFields
} from '../../../../shared/automation-schedules'
import type { AutomationDraft } from './automation-editor-dialog'
import { Field } from './automation-page-parts'

const FIELD_CONTROL_CLASS = 'border-input bg-input/30 dark:bg-input/30'

export const AUTOMATION_CRON_FIELD_LABELS = ['Minute', 'Hour', 'Day', 'Month', 'Weekday'] as const

export function getCronScheduleStatusLabel(
  schedule: string,
  validateSchedule: (schedule: string) => boolean
): { kind: 'empty' | 'invalid' | 'valid'; label: string } {
  const trimmed = schedule.trim()
  if (!trimmed) {
    return {
      kind: 'empty',
      label: translate(
        'auto.components.automations.AutomationCustomCronPanel.968e66d686',
        'Enter a five-field cron.'
      )
    }
  }
  if (!validateSchedule(trimmed)) {
    return {
      kind: 'invalid',
      label: translate(
        'auto.components.automations.AutomationCustomCronPanel.e81a02d61b',
        'Enter a valid five-field cron before saving.'
      )
    }
  }
  const formatted = formatAutomationSchedule(trimmed)
  return { kind: 'valid', label: formatted === 'Custom schedule' ? 'Valid custom cron' : formatted }
}

export function getCronFieldValues(schedule: string): readonly string[] {
  const parts = getAutomationCronExpressionFields(schedule)
  return AUTOMATION_CRON_FIELD_LABELS.map((_, index) => parts[index] ?? '...')
}

export function AutomationCustomCronPanel({
  draft,
  customScheduleInvalid,
  validateAdvancedSchedule,
  onDraftChange
}: {
  draft: AutomationDraft
  customScheduleInvalid: boolean
  validateAdvancedSchedule: (schedule: string) => boolean
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}): React.JSX.Element {
  const customScheduleStatus = getCronScheduleStatusLabel(
    draft.customSchedule,
    validateAdvancedSchedule
  )
  const cronFieldValues = getCronFieldValues(draft.customSchedule)

  return (
    <div className="grid gap-3">
      <Field
        label={translate(
          'auto.components.automations.AutomationCustomCronPanel.3e3b2c369f',
          'Cron expression'
        )}
      >
        <Input
          value={draft.customSchedule}
          placeholder="0 9 * * 1-5"
          spellCheck={false}
          className={cn('font-mono', FIELD_CONTROL_CLASS)}
          aria-invalid={customScheduleInvalid}
          aria-describedby="automation-cron-status"
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              customSchedule: event.target.value,
              scheduleWarning: null
            }))
          }
        />
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {AUTOMATION_CRON_FIELD_LABELS.map((label, index) => (
            <div
              key={label}
              className="border-border/70 bg-muted/25 min-w-0 rounded-md border px-1.5 py-1 text-center"
            >
              <div className="text-muted-foreground truncate text-[10px] font-medium">{label}</div>
              <div className="text-foreground mt-0.5 truncate font-mono text-[11px]">
                {cronFieldValues[index]}
              </div>
            </div>
          ))}
        </div>
        <div
          id="automation-cron-status"
          className={cn(
            'mt-2 flex min-h-8 items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
            customScheduleStatus.kind === 'invalid'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border/70 bg-muted/30 text-muted-foreground'
          )}
        >
          {customScheduleStatus.kind === 'invalid' ? (
            <CircleAlert className="size-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">{customScheduleStatus.label}</span>
        </div>
      </Field>
    </div>
  )
}
