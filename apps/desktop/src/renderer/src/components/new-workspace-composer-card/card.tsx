import type { SshConnectionStatus } from '@yiru/runtime-protocol/ssh-connection'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextualTour } from '@/components/contextual-tours/use-contextual-tour'
import type { NewWorkspaceProjectOption } from '@/components/new-workspace-composer-card/new-workspace-project-options'
import type { ProjectHostSetupOption } from '@/components/new-workspace-composer-card/project-host-setup-options'
import type { WorkspaceCreateErrorDisplay } from '@/components/new-workspace-composer-card/workspace-create-error-format'
import type { SmartWorkspaceNameSelection } from '@/components/new-workspace/smart-workspace-name-field'
import type { SmartNameMode } from '@/components/new-workspace/smart-workspace-source-results'
import { cn } from '@/lib/class-names'
import type { SetupConfig } from '@/lib/new-workspace'
import { useAppStore } from '@/store'

import type { ProjectSourceContext } from '../../../../shared/project-source-context'
import type {
  GitHubWorkItem,
  GitLabWorkItem,
  SetupAgentStartupPolicy,
  SparsePreset,
  TuiAgent
} from '../../../../shared/types'
import { AdvancedSection } from './advanced-section'
import { AgentSection } from './agent-section'
import type { EphemeralVmRecipeOption, RepoOption } from './card-types'
import { useComposerFileDragOver } from './file-drag'
import { NameSection } from './name-section'
import { ProjectSection } from './project-section'
import { SubmitFooter } from './submit-footer'

const EMPTY_PROJECT_OPTIONS: NewWorkspaceProjectOption[] = []
const EMPTY_PROJECT_HOST_SETUP_OPTIONS: ProjectHostSetupOption[] = []
const EMPTY_EPHEMERAL_VM_RECIPES: EphemeralVmRecipeOption[] = []

type NewWorkspaceComposerCardProps = {
  contextualTourSource?: string
  containerClassName?: string
  composerRef?: React.RefObject<HTMLDivElement | null>
  onComposerNodeChange?: (node: HTMLDivElement | null) => void
  nameInputRef?: React.RefObject<HTMLInputElement | null>
  quickAgent: TuiAgent | null
  onQuickAgentChange: (agent: TuiAgent | null) => void
  eligibleRepos: RepoOption[]
  repoId: string
  projectOptions?: NewWorkspaceProjectOption[]
  selectedProjectId?: string | null
  selectedRepoIsGit: boolean
  onRepoChange: (value: string) => void
  onProjectChange: (value: string) => void
  projectHostSetupOptions?: ProjectHostSetupOption[]
  selectedProjectHostSetupId?: string | null
  onProjectHostSetupChange?: (setupId: string) => void
  ephemeralVmRecipes?: EphemeralVmRecipeOption[]
  selectedEphemeralVmRecipeId?: string | null
  onEphemeralVmRecipeChange?: (recipeId: string | null) => void
  ephemeralVmRecipeError?: string | null
  repoBackedSearchRepos?: RepoOption[]
  repoBackedSourcesDisabled?: boolean
  allowSmartNameAddProject?: boolean
  smartNameRepoSwitchTarget?: 'project' | 'project-source'
  primaryActionLabel: string
  projectLabel?: string
  projectPlaceholder?: string
  emptyProjectMessage?: string
  showAddProjectButton?: boolean
  name: string
  onNameValueChange: (value: string) => void
  branchNameOverride: string | undefined
  onBranchNameOverrideChange: (value: string | undefined) => void
  onSmartGitHubItemSelect: (item: GitHubWorkItem) => void
  onSmartGitLabItemSelect: (item: GitLabWorkItem) => void
  onSmartBranchSelect: (refName: string, localBranchName: string) => void
  onSmartNameModeChange?: (mode: SmartNameMode) => void
  smartNameSelection: SmartWorkspaceNameSelection | null
  onClearSmartNameSelection: () => void
  /** True when an existing local branch is selected and can be reused. */
  canReuseSelectedBranch: boolean
  reuseSelectedBranch: boolean
  onReuseSelectedBranchChange: (next: boolean) => void
  /** Shows the footer "Create more" switch — worktree targets only. */
  showCreateMultiple?: boolean
  createMultiple?: boolean
  onCreateMultipleChange?: (next: boolean) => void
  smartNameGitHubSourceContext?: ProjectSourceContext | null
  /** Advisory shown under the name field when a fork PR can't accept maintainer pushes. */
  forkPushWarning: string | null
  detectedAgentIds: Set<TuiAgent> | null
  onOpenAgentSettings: () => void
  advancedOpen: boolean
  onToggleAdvanced: () => void
  createDisabled: boolean
  projectError: string | null
  creating: boolean
  onCreate: () => void
  note: string
  onNoteChange: (value: string) => void
  setupConfig: SetupConfig | null
  requiresExplicitSetupChoice: boolean
  setupDecision: 'run' | 'skip' | null
  onSetupDecisionChange: (value: 'run' | 'skip') => void
  setupAgentStartupPolicy: SetupAgentStartupPolicy
  onSetupAgentStartupPolicyChange: (value: SetupAgentStartupPolicy) => void
  shouldWaitForSetupCheck: boolean
  resolvedSetupDecision: 'run' | 'skip' | null
  createError: WorkspaceCreateErrorDisplay | null
  selectedRepoConnectionId: string | null
  selectedRepoSshStatus: SshConnectionStatus | null
  selectedRepoRequiresConnection: boolean
  selectedRepoConnectInProgress: boolean
  onConnectSelectedRepo: () => Promise<void>
  branchesEnabled?: boolean
  setupControlsEnabled?: boolean
  canUseSparseCheckout: boolean
  sparsePresets: SparsePreset[]
  sparseSelectedPresetId: string | null
  onSparseSelectPreset: (preset: SparsePreset | null) => void
  sparseControlsEnabled?: boolean
}

// Why: this component intentionally keeps the composer card's inline and modal
// variants sharing one UI surface, split across this folder's sub-components
// instead of one monolithic file so each concern (project, name, agent,
// advanced, footer) can be read and changed independently.
export function NewWorkspaceComposerCard({
  contextualTourSource,
  containerClassName,
  composerRef,
  onComposerNodeChange,
  nameInputRef,
  quickAgent,
  onQuickAgentChange,
  eligibleRepos,
  repoId,
  projectOptions = EMPTY_PROJECT_OPTIONS,
  selectedProjectId = null,
  selectedRepoIsGit,
  onRepoChange,
  onProjectChange,
  projectHostSetupOptions = EMPTY_PROJECT_HOST_SETUP_OPTIONS,
  selectedProjectHostSetupId = null,
  onProjectHostSetupChange,
  ephemeralVmRecipes = EMPTY_EPHEMERAL_VM_RECIPES,
  selectedEphemeralVmRecipeId = null,
  onEphemeralVmRecipeChange,
  ephemeralVmRecipeError = null,
  repoBackedSearchRepos,
  repoBackedSourcesDisabled = false,
  allowSmartNameAddProject = true,
  smartNameRepoSwitchTarget = 'project',
  primaryActionLabel,
  projectLabel,
  projectPlaceholder,
  emptyProjectMessage,
  showAddProjectButton = true,
  name,
  onNameValueChange,
  branchNameOverride,
  onBranchNameOverrideChange,
  onSmartGitHubItemSelect,
  onSmartGitLabItemSelect,
  onSmartBranchSelect,
  onSmartNameModeChange,
  smartNameSelection,
  onClearSmartNameSelection,
  canReuseSelectedBranch,
  reuseSelectedBranch,
  onReuseSelectedBranchChange,
  showCreateMultiple = false,
  createMultiple = false,
  onCreateMultipleChange,
  smartNameGitHubSourceContext,
  forkPushWarning,
  detectedAgentIds,
  onOpenAgentSettings,
  advancedOpen,
  onToggleAdvanced,
  createDisabled,
  projectError,
  creating,
  onCreate,
  note,
  onNoteChange,
  setupConfig,
  requiresExplicitSetupChoice,
  setupDecision,
  onSetupDecisionChange,
  setupAgentStartupPolicy,
  onSetupAgentStartupPolicyChange,
  shouldWaitForSetupCheck,
  resolvedSetupDecision,
  createError,
  selectedRepoConnectionId,
  selectedRepoSshStatus,
  selectedRepoRequiresConnection,
  selectedRepoConnectInProgress,
  onConnectSelectedRepo,
  branchesEnabled = true,
  setupControlsEnabled = true,
  canUseSparseCheckout,
  sparsePresets,
  sparseSelectedPresetId,
  onSparseSelectPreset,
  sparseControlsEnabled = true
}: NewWorkspaceComposerCardProps): React.JSX.Element {
  // Why: this form uses the lightweight translate() helper directly; subscribe
  // so an already-open create dialog repaints when the UI language changes.
  useTranslation()
  const { isFileDragOver, dragHandlers } = useComposerFileDragOver()
  const activeModal = useAppStore((s) => s.activeModal)
  const nameInputFocusFrameRef = React.useRef<number | null>(null)

  const cancelNameInputFocusFrame = React.useCallback((): void => {
    if (nameInputFocusFrameRef.current === null) {
      return
    }
    cancelAnimationFrame(nameInputFocusFrameRef.current)
    nameInputFocusFrameRef.current = null
  }, [])

  const setComposerNode = React.useCallback(
    (node: HTMLDivElement | null): void => {
      // Why: the queued repo-picker focus is only valid while this composer exists.
      if (!node) {
        cancelNameInputFocusFrame()
      }
      if (composerRef) {
        composerRef.current = node
      }
      onComposerNodeChange?.(node)
    },
    [cancelNameInputFocusFrame, composerRef, onComposerNodeChange]
  )

  const focusNameInput = React.useCallback(() => {
    // Why: after the repo picker commits a choice, moving focus to the name
    // field keeps the keyboard flow progressing through the form instead of
    // trapping the user in the repo popover interaction.
    cancelNameInputFocusFrame()
    nameInputFocusFrameRef.current = requestAnimationFrame(() => {
      nameInputFocusFrameRef.current = null
      nameInputRef?.current?.focus()
    })
  }, [cancelNameInputFocusFrame, nameInputRef])

  const handleNameEnterAdvance = React.useCallback((): void => {
    // Why: Enter on the workspace name advances focus to the next field
    // (Agent combobox) rather than submitting, letting the user progress
    // through the form with just the keyboard.
    const root = composerRef?.current
    const agentTrigger = root?.querySelector<HTMLElement>(
      '[data-agent-combobox-root="true"][role="combobox"]'
    )
    agentTrigger?.focus()
  }, [composerRef])

  useContextualTour(
    'workspace-creation',
    projectOptions.length > 0 && Boolean(selectedProjectId),
    contextualTourSource ??
      (activeModal === 'new-workspace-composer'
        ? 'workspace_creation_modal'
        : 'workspace_creation_visible')
  )

  return (
    <div
      ref={setComposerNode}
      data-workspace-composer-root="true"
      // Why: preload classifies native OS file drops by the nearest
      // `data-native-file-drop-target` marker in the composedPath. Tagging
      // the composer root makes drops anywhere on the card route to the
      // composer attachment handler instead of falling back to the default
      // editor-open behavior.
      data-native-file-drop-target="composer"
      onDragEnter={dragHandlers.onDragEnter}
      onDragLeave={dragHandlers.onDragLeave}
      className={cn(
        'grid min-w-0 gap-1 border border-transparent transition',
        isFileDragOver && 'border-ring',
        containerClassName
      )}
    >
      <div className="min-w-0 space-y-4 pt-3">
        <ProjectSection
          projectLabel={projectLabel}
          projectPlaceholder={projectPlaceholder}
          emptyProjectMessage={emptyProjectMessage}
          showAddProjectButton={showAddProjectButton}
          projectOptions={projectOptions}
          selectedProjectId={selectedProjectId}
          onProjectChange={onProjectChange}
          onProjectSelected={focusNameInput}
          projectError={projectError}
          projectHostSetupOptions={projectHostSetupOptions}
          selectedProjectHostSetupId={selectedProjectHostSetupId}
          onProjectHostSetupChange={onProjectHostSetupChange}
          ephemeralVmRecipes={ephemeralVmRecipes}
          selectedEphemeralVmRecipeId={selectedEphemeralVmRecipeId}
          onEphemeralVmRecipeChange={onEphemeralVmRecipeChange}
          ephemeralVmRecipeError={ephemeralVmRecipeError}
          eligibleRepos={eligibleRepos}
          repoId={repoId}
          selectedRepoRequiresConnection={selectedRepoRequiresConnection}
          selectedRepoConnectionId={selectedRepoConnectionId}
          selectedRepoSshStatus={selectedRepoSshStatus}
          selectedRepoConnectInProgress={selectedRepoConnectInProgress}
          onConnectSelectedRepo={onConnectSelectedRepo}
        />

        <NameSection
          selectedRepoIsGit={selectedRepoIsGit}
          nameInputRef={nameInputRef}
          eligibleRepos={eligibleRepos}
          repoId={repoId}
          onRepoChange={onRepoChange}
          name={name}
          onNameValueChange={onNameValueChange}
          onSmartGitHubItemSelect={onSmartGitHubItemSelect}
          onSmartGitLabItemSelect={onSmartGitLabItemSelect}
          onSmartBranchSelect={onSmartBranchSelect}
          onSmartNameModeChange={onSmartNameModeChange}
          smartNameSelection={smartNameSelection}
          onClearSmartNameSelection={onClearSmartNameSelection}
          smartNameGitHubSourceContext={smartNameGitHubSourceContext}
          selectedRepoRequiresConnection={selectedRepoRequiresConnection}
          branchesEnabled={branchesEnabled}
          repoBackedSourcesDisabled={repoBackedSourcesDisabled}
          repoBackedSearchRepos={repoBackedSearchRepos}
          allowSmartNameAddProject={allowSmartNameAddProject}
          smartNameRepoSwitchTarget={smartNameRepoSwitchTarget}
          forkPushWarning={forkPushWarning}
          canReuseSelectedBranch={canReuseSelectedBranch}
          reuseSelectedBranch={reuseSelectedBranch}
          onReuseSelectedBranchChange={onReuseSelectedBranchChange}
          onPlainEnterAdvance={handleNameEnterAdvance}
        />

        <AgentSection
          quickAgent={quickAgent}
          onQuickAgentChange={onQuickAgentChange}
          detectedAgentIds={detectedAgentIds}
          onOpenAgentSettings={onOpenAgentSettings}
          createDisabled={createDisabled}
          onCreate={onCreate}
        />

        <AdvancedSection
          advancedOpen={advancedOpen}
          onToggleAdvanced={onToggleAdvanced}
          smartNameSelection={smartNameSelection}
          name={name}
          onNameValueChange={onNameValueChange}
          selectedRepoIsGit={selectedRepoIsGit}
          branchesEnabled={branchesEnabled}
          branchNameOverride={branchNameOverride}
          onBranchNameOverrideChange={onBranchNameOverrideChange}
          note={note}
          onNoteChange={onNoteChange}
          setupControlsEnabled={setupControlsEnabled}
          setupConfig={setupConfig}
          requiresExplicitSetupChoice={requiresExplicitSetupChoice}
          setupDecision={setupDecision}
          onSetupDecisionChange={onSetupDecisionChange}
          setupAgentStartupPolicy={setupAgentStartupPolicy}
          onSetupAgentStartupPolicyChange={onSetupAgentStartupPolicyChange}
          shouldWaitForSetupCheck={shouldWaitForSetupCheck}
          resolvedSetupDecision={resolvedSetupDecision}
          sparseControlsEnabled={sparseControlsEnabled}
          repoId={repoId}
          sparsePresets={sparsePresets}
          sparseSelectedPresetId={sparseSelectedPresetId}
          onSparseSelectPreset={onSparseSelectPreset}
          canUseSparseCheckout={canUseSparseCheckout}
        />
      </div>

      <SubmitFooter
        createError={createError}
        showCreateMultiple={showCreateMultiple}
        createMultiple={createMultiple}
        onCreateMultipleChange={onCreateMultipleChange}
        primaryActionLabel={primaryActionLabel}
        creating={creating}
        createDisabled={createDisabled}
        onCreate={onCreate}
      />
    </div>
  )
}
