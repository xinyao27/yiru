import { FolderPlus } from '@phosphor-icons/react'
import React from 'react'
import type { NewWorkspaceProjectOption } from '~renderer/components/new-workspace-composer-card/new-workspace-project-options'
import type { ProjectHostSetupOption } from '~renderer/components/new-workspace-composer-card/project-host-setup-options'
import ProjectCombobox from '~renderer/components/new-workspace/project-combobox'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

import { WorkspaceRunTargetCombobox } from './run-target-combobox'

type ProjectSectionProps = {
  projectLabel?: string
  projectPlaceholder?: string
  emptyProjectMessage?: string
  showAddProjectButton: boolean
  projectOptions: NewWorkspaceProjectOption[]
  selectedProjectId: string | null
  onProjectChange: (value: string) => void
  onProjectSelected: () => void
  projectError: string | null
  projectHostSetupOptions: ProjectHostSetupOption[]
  selectedProjectHostSetupId: string | null
  onProjectHostSetupChange?: (setupId: string) => void
}

export function ProjectSection({
  projectLabel,
  projectPlaceholder,
  emptyProjectMessage,
  showAddProjectButton,
  projectOptions,
  selectedProjectId,
  onProjectChange,
  onProjectSelected,
  projectError,
  projectHostSetupOptions,
  selectedProjectHostSetupId,
  onProjectHostSetupChange
}: ProjectSectionProps): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const projectDescriptionId = React.useId()

  const handleAddRepo = React.useCallback((): void => {
    openModal('add-repo')
  }, [openModal])

  const readyProjectHostSetupOptions = React.useMemo(
    () => projectHostSetupOptions.filter((option) => option.kind === 'ready'),
    [projectHostSetupOptions]
  )

  return (
    <div className="space-y-1" data-contextual-tour-target="workspace-creation-project">
      <div className="flex items-center justify-between gap-2">
        <label className="text-muted-foreground text-xs font-medium">
          {projectLabel ??
            translate('auto.components.NewWorkspaceComposerCard.969a8bff66', 'Project')}
        </label>
        {showAddProjectButton ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-xs"
                  onClick={handleAddRepo}
                  className="size-5 shrink-0"
                  aria-label={translate(
                    'auto.components.NewWorkspaceComposerCard.d6b0a96f32',
                    'Add project'
                  )}
                >
                  <FolderPlus className="size-3" />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={6}>
              {translate('auto.components.NewWorkspaceComposerCard.d6b0a96f32', 'Add project')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <ProjectCombobox
        options={projectOptions}
        value={selectedProjectId}
        onValueChange={onProjectChange}
        onValueSelected={onProjectSelected}
        onAddProject={handleAddRepo}
        placeholder={
          projectPlaceholder ??
          translate('auto.components.NewWorkspaceComposerCard.dccd26d4e4', 'Choose project')
        }
        // Why: programmatic .focus() does not reliably trigger
        // :focus-visible in Chromium, so this control also changes its
        // border on :focus.
        triggerClassName="h-9 w-full border-input text-sm focus:border-ring"
        invalid={Boolean(projectError)}
        describedBy={projectDescriptionId}
      />
      {projectError ? (
        <p id={projectDescriptionId} className="text-destructive text-[11px]">
          {projectError}
        </p>
      ) : projectOptions.length === 0 ? (
        <p id={projectDescriptionId} className="text-muted-foreground text-[11px]">
          {emptyProjectMessage ??
            translate(
              'auto.components.NewWorkspaceComposerCard.addProjectBeforeWorkspace',
              'Add a project before creating a workspace.'
            )}
        </p>
      ) : null}
      {readyProjectHostSetupOptions.length > 1 ? (
        <div className="space-y-1">
          <label className="text-muted-foreground block min-w-0 truncate text-xs font-medium">
            {translate('auto.components.NewWorkspaceComposerCard.runOn', 'Run on')}
          </label>
          <WorkspaceRunTargetCombobox
            hostOptions={readyProjectHostSetupOptions}
            hostValue={selectedProjectHostSetupId ?? null}
            onHostChange={onProjectHostSetupChange}
          />
        </div>
      ) : null}
    </div>
  )
}
