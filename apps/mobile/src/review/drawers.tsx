import type { DiffComment } from '@yiru/workbench-model/workspace'
import { useMemo } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'

import type { ActionSheetAction } from '~/components/action-sheet-modal'
import { ActionSheetModal } from '~/components/action-sheet-modal'
import { BottomDrawer, BottomDrawerModalHost } from '~/components/bottom-drawer'
import { ConfirmModal } from '~/components/confirm-modal'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import {
  Check,
  Copy,
  FileText,
  Plus,
  PaperPlaneTilt as Send,
  Trash as Trash2,
  X
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { mobileReviewCountLabel } from '~/session/diff/review-screen-model'
import type { useMobileDiffReviewController } from '~/session/diff/use-review-controller'

import { mobileDiffReviewStyles as styles } from './screen-styles'

type MobileDiffReviewDrawersProps = {
  controller: ReturnType<typeof useMobileDiffReviewController>
}

export function MobileDiffReviewDrawers({
  controller
}: MobileDiffReviewDrawersProps): React.JSX.Element {
  const sendActions = useSendActions(controller)
  const overflowActions = useOverflowActions(controller)
  return (
    <>
      <BottomDrawerModalHost
        visible={
          controller.showOverflow ||
          controller.sendSheet !== null ||
          controller.composer !== null ||
          controller.showCompletion
        }
        onRequestClose={() => {
          controller.setShowOverflow(false)
          controller.setSendSheet(null)
          controller.closeComposer()
          controller.setShowCompletion(false)
        }}
      >
        <ActionSheetModal
          visible={controller.showOverflow}
          title={translate('mobile.review.actions.title', 'Review Actions')}
          message={
            controller.reviewedUnstagedCount > 0
              ? translate(
                  'mobile.review.actions.reviewedUnstaged',
                  '{{count}} reviewed unstaged files can be staged',
                  { count: controller.reviewedUnstagedCount }
                )
              : undefined
          }
          actions={overflowActions}
          onClose={() => controller.setShowOverflow(false)}
        />
        <ActionSheetModal
          visible={controller.sendSheet !== null}
          title={translate('mobile.review.sendNotes', 'Send Notes')}
          message={sendSheetMessage(controller)}
          actions={sendActions}
          onClose={() => controller.setSendSheet(null)}
        />
        <NoteComposerDrawer controller={controller} />
        <CompletionDrawer controller={controller} />
      </BottomDrawerModalHost>
      <ConfirmModal
        visible={controller.discardTarget !== null}
        title={translate('mobile.review.discard.title', 'Discard File')}
        message={
          controller.discardTarget
            ? translate(
                'mobile.review.discard.message',
                'Discard changes to "{{path}}"? This cannot be undone.',
                { path: controller.discardTarget.filePath }
              )
            : undefined
        }
        confirmLabel={translate('mobile.review.discard.confirm', 'Discard')}
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
    </>
  )
}

function useSendActions(controller: ReturnType<typeof useMobileDiffReviewController>) {
  return useMemo<ActionSheetAction[]>(() => {
    const comments = controller.unsentComments
    const terminalActions: ActionSheetAction[] =
      controller.sendSheet?.kind === 'ready' || controller.sendSheet?.kind === 'error'
        ? controller.sendSheet.terminals.map((terminal) => ({
            id: `terminal-${terminal.terminal}`,
            label: translate('mobile.review.terminalAction', '{{title}} ({{id}})', {
              title: terminal.title || translate('mobile.review.terminalFallback', 'Terminal'),
              id: terminal.terminal.slice(0, 6)
            }),
            icon: Send,
            disabled: comments.length === 0,
            dismiss: 'manual',
            onPress: () => controller.sendPromptToTerminal(terminal.terminal, comments)
          }))
        : []
    return [
      ...terminalActions,
      {
        id: 'new-agent-session',
        label: translate('mobile.review.newAgentSession', 'New Agent Session'),
        icon: Plus,
        disabled: comments.length === 0,
        dismiss: 'manual',
        onPress: () => controller.createTerminalAndSend(comments)
      },
      {
        id: 'copy-notes',
        label: translate('mobile.review.copyNotes', 'Copy Notes'),
        icon: Copy,
        disabled:
          controller.screenState.kind !== 'ready' || controller.screenState.comments.length === 0,
        dismiss: 'immediate',
        onPress: () => void controller.copyNotes()
      }
    ]
  }, [controller])
}

function useOverflowActions(controller: ReturnType<typeof useMobileDiffReviewController>) {
  return useMemo<ActionSheetAction[]>(
    () => [
      {
        id: 'copy-notes',
        label: translate('mobile.review.copyNotes', 'Copy Notes'),
        icon: Copy,
        disabled:
          controller.screenState.kind !== 'ready' || controller.screenState.comments.length === 0,
        dismiss: 'immediate',
        onPress: () => void controller.copyNotes()
      },
      {
        id: 'send-unsent-notes',
        label: translate('mobile.review.sendUnsentNotes', 'Send Unsent Notes'),
        icon: Send,
        disabled: controller.unsentComments.length === 0,
        dismiss: 'manual',
        onPress: () => {
          controller.setShowOverflow(false)
          void controller.openSendSheet()
        }
      },
      {
        id: 'clear-sent-notes',
        label: translate('mobile.review.clearSentNotes', 'Clear Sent Notes'),
        icon: Trash2,
        disabled:
          controller.screenState.kind !== 'ready' ||
          controller.screenState.comments.every((comment) => comment.sentAt === undefined),
        dismiss: 'manual',
        onPress: () => void controller.clearSentNotes()
      },
      {
        id: 'stage-reviewed-files',
        label: translate('mobile.review.stageReviewedFiles', 'Stage Reviewed Files'),
        icon: Check,
        disabled: controller.reviewedUnstagedCount === 0 || controller.busyAction !== null,
        dismiss: 'manual',
        onPress: () => void controller.stageReviewedFiles()
      },
      {
        id: 'mark-unreviewed',
        label: translate('mobile.review.markUnreviewed', 'Mark Unreviewed'),
        icon: X,
        disabled:
          controller.screenState.kind !== 'ready' ||
          !controller.currentItem ||
          !controller.currentItem.isReviewed,
        dismiss: 'manual',
        onPress: () => void controller.markUnreviewed()
      },
      {
        id: 'open-in-session',
        label: translate('mobile.review.openInSession', 'Open in Session'),
        icon: FileText,
        disabled: !controller.currentItem || controller.currentItem.scope === 'branch',
        dismiss: 'immediate',
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
    ? translate('mobile.review.loadingAgentSessions', 'Loading agent sessions...')
    : controller.sendSheet?.kind === 'error'
      ? controller.sendSheet.message
      : translate('mobile.review.unsentNoteCount', '{{count}} unsent notes', {
          count: controller.unsentComments.length
        })
}

function NoteComposerDrawer({ controller }: MobileDiffReviewDrawersProps): React.JSX.Element {
  const composer = controller.composer
  return (
    <BottomDrawer visible={composer !== null} onClose={controller.closeComposer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <View>
            <Text className={styles.drawerTitle}>
              {composer?.mode === 'edit'
                ? translate('mobile.review.editNote', 'Edit Note')
                : translate('mobile.review.addNote', 'Add Note')}
            </Text>
            <Text className={styles.drawerSubtitle}>
              {composer?.mode === 'create' && composer.lineNumber > 0
                ? translate('mobile.review.lineNumber', 'Line {{line}}', {
                    line: composer.lineNumber
                  })
                : translate('mobile.review.fileNote', 'File note')}
            </Text>
          </View>
          <MobileGlassIconButton
            accessibilityLabel={translate('mobile.review.cancelNote', 'Cancel note')}
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
            placeholder={translate('mobile.review.notePlaceholder', 'Review note')}
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
    ? translate('mobile.review.saveLineNote', 'Save note on line {{line}}', {
        line: composer.lineNumber
      })
    : translate('mobile.review.notePlaceholder', 'Review note')
}

function DeleteNoteButton({ onPress }: { onPress: () => Promise<void> }) {
  return (
    <MobileGlassTextButton
      accessibilityLabel={translate('mobile.review.deleteNote', 'Delete note')}
      isDestructive
      label={translate('mobile.common.delete', 'Delete')}
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
      label={translate('mobile.common.save', 'Save')}
      onPress={() => void controller.saveComposer()}
      size="regular"
    />
  )
}

function CompletionDrawer({ controller }: MobileDiffReviewDrawersProps): React.JSX.Element {
  const noteCount =
    controller.screenState.kind === 'ready' ? controller.screenState.comments.length : 0
  return (
    <BottomDrawer
      visible={controller.showCompletion}
      onClose={() => controller.setShowCompletion(false)}
    >
      <Text className={styles.drawerTitle}>
        {translate('mobile.review.complete.title', 'Review Complete')}
      </Text>
      <Text className={styles.drawerSubtitle}>
        {translate('mobile.review.complete.summary', '{{files}} reviewed, {{notes}}', {
          files: mobileReviewCountLabel(
            controller.queue.length,
            translate('mobile.review.fileSingular', 'file'),
            translate('mobile.review.filePlural', 'files')
          ),
          notes: mobileReviewCountLabel(
            noteCount,
            translate('mobile.review.noteSingular', 'note'),
            translate('mobile.review.notePlural', 'notes')
          )
        })}
      </Text>
      <MobileGlassGroup className={styles.drawerButtonRow} spacing={8}>
        <MobileGlassTextButton
          disabled={controller.reviewedUnstagedCount === 0}
          label={translate('mobile.review.stageReviewed', 'Stage Reviewed')}
          onPress={() => void controller.stageReviewedFiles()}
          accessibilityLabel={translate('mobile.review.stageReviewedFiles', 'Stage reviewed files')}
          size="regular"
        />
        <MobileGlassTextButton
          disabled={controller.unsentComments.length === 0}
          isProminent
          label={translate('mobile.review.sendNotes', 'Send Notes')}
          onPress={() => {
            controller.setShowCompletion(false)
            void controller.openSendSheet()
          }}
          accessibilityLabel={translate('mobile.review.sendNotesToAgent', 'Send notes to agent')}
          size="regular"
        />
      </MobileGlassGroup>
    </BottomDrawer>
  )
}
