import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { YiruHooks, ProjectHostSetup, Repo } from '../../../../shared/types'
import type { AutomationCreateTarget, AutomationDraft } from './automation-editor-dialog'
import { getVisibleAutomationSetupDecision } from './automation-setup-decision'

type AutomationSetupDecisionFieldProps = {
  createTarget: AutomationCreateTarget
  draft: AutomationDraft
  repos: readonly Repo[]
  projectHostSetups: readonly ProjectHostSetup[]
  yamlHooks?: YiruHooks | null
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
  onSetupDecisionTouched: () => void
}

export function AutomationSetupDecisionField({
  createTarget,
  draft,
  repos,
  projectHostSetups,
  yamlHooks,
  onDraftChange,
  onSetupDecisionTouched
}: AutomationSetupDecisionFieldProps): React.JSX.Element | null {
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const defaultDecision = getVisibleAutomationSetupDecision({
    createTarget,
    workspaceMode: draft.workspaceMode,
    repoId: draft.projectId,
    repos,
    projectHostSetups,
    yamlHooks
  })
  if (!defaultDecision) {
    return null
  }
  const checked = (draft.setupDecision ?? defaultDecision) === 'run'
  const label = translate(
    'auto.components.automations.AutomationSetupDecisionField.5a7863909c',
    'Run setup for each new workspace'
  )
  return (
    // Why: the setup choice is a power-user knob, so tuck it behind the same
    // Advanced disclosure grammar the New Workspace composer uses.
    <div className="mt-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAdvancedOpen((open) => !open)}
        className="-ml-2 text-xs"
      >
        {translate(
          'auto.components.automations.AutomationSetupDecisionField.18f000ad4e',
          'Advanced'
        )}
        <ChevronDown
          weight="regular"
          className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
        />
      </Button>
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!advancedOpen}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'space-y-1 px-1 pt-2 transition-[opacity,transform] duration-150 ease-out',
              advancedOpen
                ? 'translate-y-0 opacity-100 delay-200'
                : '-translate-y-1 opacity-0 delay-0'
            )}
          >
            <label className="text-foreground flex items-center gap-2 text-xs">
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) => {
                  onSetupDecisionTouched()
                  onDraftChange((current) => ({
                    ...current,
                    setupDecision: nextChecked ? 'run' : 'skip'
                  }))
                }}
              />
              <span>{label}</span>
            </label>
            <p className="text-muted-foreground pl-6 text-xs">
              {translate(
                'auto.components.automations.AutomationSetupDecisionField.874b72195b',
                "When this automation creates a workspace, prepare it the same way creating a worktree by hand does — run the project's setup and open its terminal tabs."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
