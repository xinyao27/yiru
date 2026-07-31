import type { DiffComment } from '@yiru/workbench-model/workspace'
import { useMemo } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'

import {
  Check,
  Copy,
  FileText,
  Plus,
  PaperPlaneTilt as Send,
  Trash as Trash2,
  X
} from '~/components/uniwind-icons'

import { mobileReviewCountLabel } from '../session/diff/review-screen-model'
import type { useMobileDiffReviewController } from '../session/diff/use-review-controller'
import type { ActionSheetAction } from './action-sheet-modal'
import { ActionSheetModal } from './action-sheet-modal'
import { BottomDrawer } from './bottom-drawer'
import { ConfirmModal } from './confirm-modal'
import { mobileDiffReviewStyles as styles } from './diff-review-screen-styles'
import { MobileGlassGroup } from './glass/group'
import { MobileGlassIconButton } from './glass/icon-button'
import { MobileGlassSurface } from './glass/surface'
import { MobileGlassTextButton } from './glass/text-button'

type Props = {
  controller: ReturnType<typeof useMobileDiffReviewController>
}

export function MobileDiffReviewDrawers({ controller }: Props) {
  const sendActions = useSendActions(controller)
  const overflowActions = useOverflowActions(controller)
  return (
    <>
      <ActionSheetModal
        visible={controller.showOverflow}
        title="Review Actions"
        message={
          controller.reviewedUnstagedCount > 0
            ? `${controller.reviewedUnstagedCount} reviewed unstaged files can be staged`
            : undefined
        }
        actions={overflowActions}
        onClose={() => controller.setShowOverflow(false)}
      />
      <ActionSheetModal
        visible={controller.sendSheet !== null}
        title="Send Notes"
        message={sendSheetMessage(controller)}
        actions={sendActions}
        onClose={() => controller.setSendSheet(null)}
      />
      <ConfirmModal
        visible={controller.discardTarget !== null}
        title="Discard File"
        message={
          controller.discardTarget
            ? `Discard changes to "${controller.discardTarget.filePath}"? This cannot be undone.`
            : undefined
        }
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          const target = controller.discardTarget
          controller.setDiscardTarget(null)
          if (target) {
            void controller.runGitMutation('git.discard', target)
          }
        }}
        onCancel={() => controller.setDiscardTarget(null)}
      />
      <NoteComposerDrawer controller={controller} />
      <CompletionDrawer controller={controller} />
    </>
  )
}

function useSendActions(controller: ReturnType<typeof useMobileDiffReviewController>) {
  return useMemo<ActionSheetAction[]>(() => {
    const comments = controller.unsentComments
    const terminalActions =
      controller.sendSheet?.kind === 'ready' || controller.sendSheet?.kind === 'error'
        ? controller.sendSheet.terminals.map((terminal) => ({
            label: `${terminal.title || 'Terminal'} (${terminal.terminal.slice(0, 6)})`,
            icon: Send,
            disabled: comments.length === 0,
            skipAutoClose: true,
            onPress: () => void controller.sendPromptToTerminal(terminal.terminal, comments)
          }))
        : []
    return [
      ...terminalActions,
      {
        label: 'New Agent Session',
        icon: Plus,
        disabled: comments.length === 0,
        skipAutoClose: true,
        onPress: () => void controller.createTerminalAndSend(comments)
      },
      {
        label: 'Copy Notes',
        icon: Copy,
        disabled:
          controller.screenState.kind !== 'ready' || controller.screenState.comments.length === 0,
        onPress: () => void controller.copyNotes()
      }
    ]
  }, [controller])
}

function useOverflowActions(controller: ReturnType<typeof useMobileDiffReviewController>) {
  return useMemo<ActionSheetAction[]>(
    () => [
      {
        label: 'Copy Notes',
        icon: Copy,
        disabled:
          controller.screenState.kind !== 'ready' || controller.screenState.comments.length === 0,
        onPress: () => void controller.copyNotes()
      },
      {
        label: 'Send Unsent Notes',
        icon: Send,
        disabled: controller.unsentComments.length === 0,
        skipAutoClose: true,
        onPress: () => void controller.openSendSheet()
      },
      {
        label: 'Clear Sent Notes',
        icon: Trash2,
        disabled:
          controller.screenState.kind !== 'ready' ||
          controller.screenState.comments.every((comment) => comment.sentAt === undefined),
        skipAutoClose: true,
        onPress: () => void controller.clearSentNotes()
      },
      {
        label: 'Stage Reviewed Files',
        icon: Check,
        disabled: controller.reviewedUnstagedCount === 0 || controller.busyAction !== null,
        skipAutoClose: true,
        onPress: () => void controller.stageReviewedFiles()
      },
      {
        label: 'Mark Unreviewed',
        icon: X,
        disabled:
          controller.screenState.kind !== 'ready' ||
          !controller.currentItem ||
          !controller.currentItem.isReviewed,
        skipAutoClose: true,
        onPress: () => void controller.markUnreviewed()
      },
      {
        label: 'Open in Session',
        icon: FileText,
        disabled: !controller.currentItem || controller.currentItem.scope === 'branch',
        onPress: () => void controller.openInSession()
      }
    ],
    [controller]
  )
}

function sendSheetMessage(
  controller: ReturnType<typeof useMobileDiffReviewController>
): string | undefined {
  return controller.sendSheet?.kind === 'loading'
    ? 'Loading agent sessions...'
    : controller.sendSheet?.kind === 'error'
      ? controller.sendSheet.message
      : `${controller.unsentComments.length} unsent notes`
}

function NoteComposerDrawer({ controller }: Props) {
  const composer = controller.composer
  return (
    <BottomDrawer visible={composer !== null} onClose={controller.closeComposer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <View>
            <Text className={styles.drawerTitle}>
              {composer?.mode === 'edit' ? 'Edit Note' : 'Add Note'}
            </Text>
            <Text className={styles.drawerSubtitle}>
              {composer?.mode === 'create' && composer.lineNumber > 0
                ? `Line ${composer.lineNumber}`
                : 'File note'}
            </Text>
          </View>
          <MobileGlassIconButton
            accessibilityLabel="Cancel note"
            icon="close"
            onPress={controller.closeComposer}
          />
        </View>
        <MobileGlassSurface className="min-h-28 overflow-hidden rounded-2xl" isInteractive>
          <TextInput
            className="text-foreground min-h-28 p-3 text-sm leading-5"
            style={{ textAlignVertical: 'top' }}
            value={controller.composerBody}
            onChangeText={controller.setComposerBody}
            multiline
            autoFocus
            placeholder="Review note"
            placeholderTextColorClassName="accent-muted-foreground"
            accessibilityLabel={composerLabel(composer)}
          />
        </MobileGlassSurface>
        <MobileGlassGroup className={styles.drawerButtonRow} spacing={8}>
          {composer?.mode === 'edit' ? (
            <DeleteNoteButton onPress={controller.deleteComment} />
          ) : null}
          <SaveNoteButton controller={controller} composer={composer} />
        </MobileGlassGroup>
      </KeyboardAvoidingView>
    </BottomDrawer>
  )
}

function composerLabel(
  composer: { mode: 'create'; lineNumber: number } | { mode: 'edit'; comment: DiffComment } | null
): string {
  return composer?.mode === 'create' && composer.lineNumber > 0
    ? `Save note on line ${composer.lineNumber}`
    : 'Review note'
}

function DeleteNoteButton({ onPress }: { onPress: () => Promise<void> }) {
  return (
    <MobileGlassTextButton
      accessibilityLabel="Delete note"
      isDestructive
      label="Delete"
      onPress={() => void onPress()}
      size="regular"
    />
  )
}

function SaveNoteButton({
  controller,
  composer
}: {
  controller: ReturnType<typeof useMobileDiffReviewController>
  composer: ReturnType<typeof useMobileDiffReviewController>['composer']
}) {
  const disabled = controller.composerBody.trim().length === 0
  return (
    <MobileGlassTextButton
      accessibilityLabel={composerLabel(composer)}
      disabled={disabled}
      isProminent
      label="Save"
      onPress={() => void controller.saveComposer()}
      size="regular"
    />
  )
}

function CompletionDrawer({ controller }: Props) {
  const noteCount =
    controller.screenState.kind === 'ready' ? controller.screenState.comments.length : 0
  return (
    <BottomDrawer
      visible={controller.showCompletion}
      onClose={() => controller.setShowCompletion(false)}
    >
      <Text className={styles.drawerTitle}>Review Complete</Text>
      <Text className={styles.drawerSubtitle}>
        {mobileReviewCountLabel(controller.queue.length, 'file', 'files')} reviewed,{' '}
        {mobileReviewCountLabel(noteCount, 'note', 'notes')}
      </Text>
      <MobileGlassGroup className={styles.drawerButtonRow} spacing={8}>
        <MobileGlassTextButton
          disabled={controller.reviewedUnstagedCount === 0}
          label="Stage Reviewed"
          onPress={() => void controller.stageReviewedFiles()}
          accessibilityLabel="Stage reviewed files"
          size="regular"
        />
        <MobileGlassTextButton
          disabled={controller.unsentComments.length === 0}
          isProminent
          label="Send Notes"
          onPress={() => void controller.openSendSheet()}
          accessibilityLabel="Send notes to agent"
          size="regular"
        />
      </MobileGlassGroup>
    </BottomDrawer>
  )
}
