import React, { useCallback, useState } from 'react'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store'

import { useCompleteGitRepoAdd } from '../use-complete-git-repo-add'
import { useCreateProjectDefaults } from '../use-create-project-defaults'
import { useCreateRepo } from '../use-create-repo'
import { AddRepoDialogChrome } from './dialog-chrome'
import { AddRepoDialogStepContent } from './dialog-step-content'
import type { AddRepoDialogStep } from './dialog-types'
import { AddRepoHostSelectorSlot } from './host-selector-slot'
import { useAddRepoCloneFlow } from './use-clone-flow'
import { useAddRepoHostChangeReset } from './use-host-change-reset'
import { useAddRepoHostSelection } from './use-host-selection'
import { useAddRepoLocalFolderFlow } from './use-local-folder-flow'
import { useAddRepoNestedImportFlow } from './use-nested-import-flow'
import { useAddRepoNestedReviewState } from './use-nested-review-state'
import { useAddRepoServerPathFlow } from './use-server-path-flow'

const AddRepoDialog = React.memo(function AddRepoDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const addRepoPath = useAppStore((s) => s.addRepoPath)
  const scanNestedRepos = useAppStore((s) => s.scanNestedRepos)
  const cancelNestedRepoScan = useAppStore((s) => s.cancelNestedRepoScan)
  const importNestedRepos = useAppStore((s) => s.importNestedRepos)
  const repos = useAppStore((s) => s.repos)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const settings = useAppStore((s) => s.settings)
  const completeGitRepoAdd = useCompleteGitRepoAdd({
    closeModal,
    setHideDefaultBranchWorkspace
  })

  const [step, setStep] = useState<AddRepoDialogStep>('add')
  const [isAdding, setIsAdding] = useState(false)
  const [addProjectBusyLabel, setAddProjectBusyLabel] = useState<string | null>(null)
  const {
    nestedScan,
    nestedSelectedPaths,
    nestedGroupName,
    nestedAttemptId,
    nestedRuntimeKind,
    nestedScanInProgress,
    nestedScanId,
    nestedImportScanId,
    setNestedSelectedPaths,
    setNestedGroupName,
    setNestedScanInProgress,
    getNestedRepoRuntimeKind,
    showNestedRepoReview,
    setActiveNestedScanId,
    handleStopNestedScan,
    resetNestedRepoReviewState
  } = useAddRepoNestedReviewState({
    activeRuntimeEnvironmentId: settings?.activeRuntimeEnvironmentId,
    cancelNestedRepoScan,
    setStep
  })

  const hostSelection = useAddRepoHostSelection({ isOpen: activeModal === 'add-repo', setStep })
  const selectedRuntimeEnvironmentId =
    hostSelection.selectedParsedHost?.kind === 'runtime'
      ? hostSelection.selectedParsedHost.environmentId
      : null

  const {
    createName,
    createParent,
    createError,
    isCreating,
    setCreateName,
    setCreateParent,
    setCreateError,
    resetCreateState,
    handlePickParent,
    handleCreate
  } = useCreateRepo(
    fetchWorktrees,
    closeModal,
    (repoId) => completeGitRepoAdd(repoId, 'create_project'),
    {
      hostId: hostSelection.selectedHostId,
      runtimeEnvironmentId: selectedRuntimeEnvironmentId
    }
  )

  const {
    createDefaultParent,
    createGitAvailability,
    createRuntimeParentStatus,
    createParentDefaultPending,
    resetCreateDefaultState,
    markCreateParentTouched
  } = useCreateProjectDefaults({
    step,
    activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
    createParent,
    setCreateParent
  })

  const {
    cloneUrl,
    cloneDestination,
    cloneError,
    cloneProgress,
    isCloning,
    setCloneUrl,
    setCloneDestination,
    setCloneError,
    resetCloneFlow,
    handlePickDestination,
    handleClone
  } = useAddRepoCloneFlow({
    step,
    activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
    workspaceDir: settings?.workspaceDir,
    fetchWorktrees,
    onGitRepoReady: completeGitRepoAdd
  })

  const isOpen = activeModal === 'add-repo'
  const droppedLocalPath =
    typeof modalData.droppedLocalPath === 'string' ? modalData.droppedLocalPath : ''
  const isRuntimeEnvironmentActive = Boolean(selectedRuntimeEnvironmentId)
  const selectedHostKind = hostSelection.selectedParsedHost?.kind
  const { handleBrowse, resetLocalFolderFlow } = useAddRepoLocalFolderFlow({
    isOpen,
    droppedLocalPath,
    activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
    addRepoPath,
    closeModal,
    fetchWorktrees,
    scanNestedRepos,
    setActiveNestedScanId,
    setNestedScanInProgress,
    showNestedRepoReview,
    onGitRepoReady: completeGitRepoAdd,
    setIsAdding,
    setAddProjectBusyLabel
  })
  const {
    serverPath,
    isAddingServerPath,
    setServerPath,
    resetServerPathFlow,
    handleAddServerPath
  } = useAddRepoServerPathFlow({
    addRepoPath,
    closeModal,
    fetchWorktrees,
    getNestedRepoRuntimeKind,
    scanNestedRepos,
    setActiveNestedScanId,
    setNestedScanInProgress,
    showNestedRepoReview,
    onGitRepoReady: completeGitRepoAdd,
    setAddProjectBusyLabel
  })
  const {
    handleImportNestedRepos,
    handleOpenNestedRootFolder,
    resetNestedImportFlow,
    trackNestedBackAction
  } = useAddRepoNestedImportFlow({
    nestedAttemptId,
    nestedScan,
    nestedSelectedPaths,
    nestedRuntimeKind,
    nestedGroupName,
    nestedImportScanId,
    activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
    fetchWorktrees,
    importNestedRepos,
    getNestedRepoRuntimeKind,
    onGitRepoReady: completeGitRepoAdd,
    setIsAdding
  })

  const resetState = useCallback(() => {
    // Why: kill the git clone process if one is running, so backing out
    // or closing the dialog doesn't leave a clone running on disk.
    void workspaceHostClient.repos.cloneAbort()
    resetLocalFolderFlow()
    setStep('add')
    setIsAdding(false)
    setAddProjectBusyLabel(null)
    resetServerPathFlow()
    resetCloneFlow()
    resetNestedImportFlow()
    resetNestedRepoReviewState()
    resetCreateDefaultState()
    resetCreateState()
  }, [
    resetCloneFlow,
    resetLocalFolderFlow,
    resetNestedRepoReviewState,
    resetCreateDefaultState,
    resetServerPathFlow,
    resetNestedImportFlow,
    resetCreateState
  ])

  const resetHostScopedState = useCallback(() => {
    setIsAdding(false)
    setAddProjectBusyLabel(null)
    resetServerPathFlow()
    resetCloneFlow()
    resetCreateDefaultState()
    resetCreateState()
  }, [resetCloneFlow, resetCreateDefaultState, resetCreateState, resetServerPathFlow])

  useAddRepoHostChangeReset({
    isOpen,
    selectedHostId: hostSelection.selectedHostId,
    onResetClosed: resetState,
    onResetHostScopedState: resetHostScopedState
  })

  const handleBack = useCallback(() => {
    if (step === 'nested') {
      trackNestedBackAction()
    }
    resetState()
  }, [resetState, step, trackNestedBackAction])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (step === 'nested' && !isAdding) {
          trackNestedBackAction()
        }
        closeModal()
        resetState()
      }
    },
    [closeModal, isAdding, resetState, step, trackNestedBackAction]
  )

  return (
    <AddRepoDialogChrome
      isOpen={isOpen}
      step={step}
      isAdding={isAdding}
      onBack={handleBack}
      onOpenChange={handleOpenChange}
    >
      <AddRepoDialogStepContent
        step={step}
        isRuntimeEnvironmentActive={isRuntimeEnvironmentActive}
        activeRuntimeEnvironmentId={selectedRuntimeEnvironmentId}
        repoCount={repos.length}
        isAdding={isAdding}
        addProjectBusyLabel={addProjectBusyLabel}
        nestedScanInProgress={nestedScanInProgress}
        nestedScanId={nestedScanId}
        serverPath={serverPath}
        isAddingServerPath={isAddingServerPath}
        cloneUrl={cloneUrl}
        cloneDestination={cloneDestination}
        cloneError={cloneError}
        cloneProgress={cloneProgress}
        isCloning={isCloning}
        selectedHostLabel={
          hostSelection.hostOptions.find((host) => host.id === hostSelection.selectedHostId)
            ?.label ?? hostSelection.selectedHostId
        }
        nestedScan={nestedScan}
        nestedSelectedPaths={nestedSelectedPaths}
        nestedGroupName={nestedGroupName}
        createName={createName}
        createParent={createParent}
        createError={createError}
        isCreating={isCreating}
        hostSelector={<AddRepoHostSelectorSlot hostSelection={hostSelection} />}
        browseHostKind={selectedHostKind === 'runtime' ? selectedHostKind : 'local'}
        createDefaultParent={createDefaultParent}
        createGitAvailability={createGitAvailability}
        createRuntimeParentStatus={createRuntimeParentStatus}
        createParentDefaultPending={createParentDefaultPending}
        manualCreateParentEntry={isRuntimeEnvironmentActive}
        onBrowse={selectedHostKind === 'runtime' ? () => setStep('server-path') : handleBrowse}
        onOpenCloneStep={() => {
          setCloneError(null)
          setStep('clone')
        }}
        onOpenCreateStep={() => {
          setCreateError(null)
          setStep('create')
        }}
        onStopNestedScan={handleStopNestedScan}
        onServerPathChange={setServerPath}
        onAddServerPath={(kind) => void handleAddServerPath(kind)}
        onCloneUrlChange={(value) => {
          setCloneUrl(value)
          setCloneError(null)
        }}
        onCloneDestinationChange={(value) => {
          setCloneDestination(value)
          setCloneError(null)
        }}
        onPickCloneDestination={handlePickDestination}
        onClone={handleClone}
        onNestedGroupNameChange={setNestedGroupName}
        onNestedSelectedPathsChange={setNestedSelectedPaths}
        onImportNestedRepos={(mode) => void handleImportNestedRepos(mode)}
        onOpenNestedRootFolder={() => void handleOpenNestedRootFolder()}
        onCreateNameChange={(value) => {
          setCreateName(value)
          setCreateError(null)
        }}
        onCreateParentChange={(value) => {
          markCreateParentTouched(value)
          setCreateParent(value)
          setCreateError(null)
        }}
        onPickCreateParent={() => {
          void handlePickParent().then((dir) => {
            if (dir) {
              markCreateParentTouched(dir)
            }
          })
        }}
        onCreate={handleCreate}
      />
    </AddRepoDialogChrome>
  )
})

export default AddRepoDialog
