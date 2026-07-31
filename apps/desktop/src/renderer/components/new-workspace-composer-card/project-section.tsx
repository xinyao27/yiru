import { PlugCharging as PlugZap, FolderPlus } from '@phosphor-icons/react'
import type { SshConnectionStatus } from '@yiru/runtime-protocol/ssh-connection'
import React from 'react'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import type { NewWorkspaceProjectOption } from '~renderer/components/new-workspace-composer-card/new-workspace-project-options'
import type { ProjectHostSetupOption } from '~renderer/components/new-workspace-composer-card/project-host-setup-options'
import ProjectCombobox from '~renderer/components/new-workspace/project-combobox'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

import type { EphemeralVmRecipeOption, RepoOption } from './card-types'
import { WorkspaceRunTargetCombobox } from './run-target-combobox'
import { getSshStatusLabel } from './ssh-status'

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
  ephemeralVmRecipes: EphemeralVmRecipeOption[]
  selectedEphemeralVmRecipeId: string | null
  onEphemeralVmRecipeChange?: (recipeId: string | null) => void
  ephemeralVmRecipeError: string | null
  eligibleRepos: RepoOption[]
  repoId: string
  selectedRepoRequiresConnection: boolean
  selectedRepoConnectionId: string | null
  selectedRepoSshStatus: SshConnectionStatus | null
  selectedRepoConnectInProgress: boolean
  onConnectSelectedRepo: () => Promise<void>
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
  onProjectHostSetupChange,
  ephemeralVmRecipes,
  selectedEphemeralVmRecipeId,
  onEphemeralVmRecipeChange,
  ephemeralVmRecipeError,
  eligibleRepos,
  repoId,
  selectedRepoRequiresConnection,
  selectedRepoConnectionId,
  selectedRepoSshStatus,
  selectedRepoConnectInProgress,
  onConnectSelectedRepo
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

  const selectedRepoName = React.useMemo(() => {
    const repo = eligibleRepos.find((candidate) => candidate.id === repoId)
    return repo?.displayName ?? repo?.path ?? 'This project'
  }, [eligibleRepos, repoId])
  const selectedProjectName = React.useMemo(() => {
    const option = projectOptions.find((candidate) => candidate.id === selectedProjectId)
    return option?.displayName ?? selectedRepoName
  }, [projectOptions, selectedProjectId, selectedRepoName])

  const sshStatusLabel = selectedRepoSshStatus
    ? getSshStatusLabel(selectedRepoSshStatus)
    : translate('auto.components.NewWorkspaceComposerCard.notConnected', 'Not connected')
  const connectButtonLabel =
    selectedRepoSshStatus === 'disconnected' || selectedRepoSshStatus === null
      ? 'Connect'
      : 'Reconnect'

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
      {readyProjectHostSetupOptions.length > 1 || ephemeralVmRecipes.length > 0 ? (
        <div className="space-y-1">
          <label className="text-muted-foreground block min-w-0 truncate text-xs font-medium">
            {translate('auto.components.NewWorkspaceComposerCard.runOn', 'Run on')}
          </label>
          <WorkspaceRunTargetCombobox
            hostOptions={readyProjectHostSetupOptions}
            hostValue={selectedProjectHostSetupId ?? null}
            onHostChange={onProjectHostSetupChange}
            recipes={ephemeralVmRecipes}
            recipeValue={selectedEphemeralVmRecipeId}
            onRecipeChange={onEphemeralVmRecipeChange}
          />
          {ephemeralVmRecipeError ? (
            <p className="text-destructive text-[11px] whitespace-pre-line">
              {ephemeralVmRecipeError}
            </p>
          ) : null}
        </div>
      ) : ephemeralVmRecipeError ? (
        <p className="text-destructive text-[11px] whitespace-pre-line">{ephemeralVmRecipeError}</p>
      ) : null}
      {selectedRepoRequiresConnection && selectedRepoConnectionId ? (
        <div
          role="status"
          aria-live="polite"
          className="border-border/70 bg-muted/35 flex items-center justify-between gap-3 border px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-foreground truncate text-xs font-medium">
              {translate('auto.components.NewWorkspaceComposerCard.b5a0796911', 'Connect')}{' '}
              {selectedProjectName}
            </div>
            <div className="text-muted-foreground mt-0.5 text-[11px]">{sshStatusLabel}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void onConnectSelectedRepo()}
            disabled={selectedRepoConnectInProgress}
            className="shrink-0"
          >
            {selectedRepoConnectInProgress ? (
              <LoadingIndicator className="size-3.5" />
            ) : (
              <PlugZap className="size-3.5" />
            )}
            {selectedRepoConnectInProgress
              ? translate('auto.components.NewWorkspaceComposerCard.f660aa1454', 'Connecting')
              : connectButtonLabel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
