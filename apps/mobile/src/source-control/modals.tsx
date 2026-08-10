import { openMobilePrUrl } from '~/session/pr/compose-sheet'

import { ActionSheetModal, type ActionSheetAction } from '../components/action-sheet-modal'
import { BottomDrawerModalHost } from '../components/bottom-drawer'
import { ConfirmModal } from '../components/confirm-modal'
import { SelectionDrawer, type SelectionDrawerOption } from '../components/selection-drawer'
import { translate } from '../i18n/translate'
import { MobileBranchDiffPreviewDrawer } from './branch-diff-preview-drawer'
import type { MobileSourceControlState } from './use-source-control-state'

type MobileSourceControlModalsProps = {
  state: MobileSourceControlState
  actionSheetActions: ActionSheetAction[]
}

export function MobileSourceControlModals({
  state,
  actionSheetActions
}: MobileSourceControlModalsProps): React.JSX.Element {
  const {
    branchDiffPreview,
    setBranchDiffPreview,
    showActionSheet,
    setShowActionSheet,
    discardTarget,
    setDiscardTarget,
    showBranchPicker,
    setShowBranchPicker,
    localBranches,
    createdPrUrl,
    setCreatedPrUrl,
    createdPrWarning,
    setCreatedPrWarning,
    branchLabel,
    checkoutBranch,
    runGitStep
  } = state

  const branchOptions = (localBranches?.branches ?? []).map(
    (branch): SelectionDrawerOption<string, string> => ({
      id: branch,
      value: branch,
      label: branch,
      supportingText:
        branch === localBranches?.current
          ? translate('mobile.sourceControl.branchPicker.current', 'Current branch')
          : undefined
    })
  )

  return (
    <>
      <MobileBranchDiffPreviewDrawer
        branchDiffPreview={branchDiffPreview}
        onClose={() => setBranchDiffPreview(null)}
      />

      <BottomDrawerModalHost
        visible={showActionSheet || showBranchPicker}
        onRequestClose={() => {
          setShowActionSheet(false)
          setShowBranchPicker(false)
        }}
      >
        <ActionSheetModal
          visible={showActionSheet}
          title={translate('mobile.sourceControl.actionSheet.title', 'Source Control')}
          message={branchLabel}
          actions={actionSheetActions}
          onClose={() => setShowActionSheet(false)}
        />

        <SelectionDrawer<string, string>
          visible={showBranchPicker}
          title={translate('mobile.sourceControl.branchPicker.title', 'Switch Branch')}
          options={branchOptions}
          selectedId={localBranches?.current ?? null}
          onSelect={(branch) => {
            if (branch !== localBranches?.current) {
              void checkoutBranch(branch)
            }
          }}
          onClose={() => setShowBranchPicker(false)}
        />
      </BottomDrawerModalHost>

      <ConfirmModal
        visible={discardTarget !== null}
        title={translate('mobile.sourceControl.discardChange.title', 'Discard Change')}
        message={
          discardTarget
            ? translate(
                'mobile.sourceControl.discardChange.message',
                'Discard changes to "{{path}}"? This cannot be undone.',
                { path: discardTarget.path }
              )
            : undefined
        }
        confirmLabel={translate('mobile.sourceControl.discardChange.confirm', 'Discard')}
        destructive
        onConfirm={() => {
          if (discardTarget) {
            void runGitStep(`discard:${discardTarget.path}`, {
              kind: 'discard',
              filePath: discardTarget.path
            })
          }
          // Modal visibility is derived from discardTarget — clear it so it dismisses.
          setDiscardTarget(null)
        }}
        onCancel={() => setDiscardTarget(null)}
      />

      <ConfirmModal
        visible={createdPrUrl !== null}
        title={translate('mobile.sourceControl.createdPr.title', 'Pull Request Created')}
        message={
          createdPrWarning
            ? translate(
                'mobile.sourceControl.createdPr.openWithWarning',
                'Open it in your browser?\n\n{{warning}}',
                { warning: createdPrWarning }
              )
            : translate('mobile.sourceControl.createdPr.openPrompt', 'Open it in your browser?')
        }
        confirmLabel={translate('mobile.sourceControl.createdPr.open', 'Open')}
        onConfirm={() => {
          if (createdPrUrl) {
            openMobilePrUrl(createdPrUrl)
          }
          setCreatedPrUrl(null)
          setCreatedPrWarning(null)
        }}
        onCancel={() => {
          setCreatedPrUrl(null)
          setCreatedPrWarning(null)
        }}
      />
    </>
  )
}
