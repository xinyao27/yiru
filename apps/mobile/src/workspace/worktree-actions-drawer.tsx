import { useState } from 'react'
import { Text, View } from 'react-native'

import { buildWorktreeNavigationActions } from '~/agent-history/worktree-navigation-actions'
import { ActionSheetContent } from '~/components/action-sheet-modal'
import { BottomDrawer } from '~/components/bottom-drawer'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { Moon, PushPin as Pin, Trash } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { Worktree } from './list-sections'

type MobileWorktreeActionsDrawerProps = {
  hostCapabilities?: readonly string[]
  hostId: string
  isPinned: boolean
  target: Worktree | null
  navigate: (target: string) => void
  onClose: () => void
  onDelete: (target: Worktree) => void | Promise<void>
  onSleep: (target: Worktree) => void
  onTogglePin: (target: Worktree) => void
}

export function MobileWorktreeActionsDrawer({
  hostCapabilities,
  hostId,
  isPinned,
  target,
  navigate,
  onClose,
  onDelete,
  onSleep,
  onTogglePin
}: MobileWorktreeActionsDrawerProps): React.JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<Worktree | null>(null)

  function close(): void {
    setDeleteTarget(null)
    onClose()
  }

  const title = deleteTarget
    ? translate('mobile.workspace.delete.title', 'Delete Worktree')
    : target?.displayName || target?.repo || translate('mobile.common.actions', 'Actions')

  return (
    <BottomDrawer visible={target !== null} onClose={close} title={title}>
      {deleteTarget ? (
        <View>
          <View className="pb-4">
            <Text className="text-muted-foreground text-sm leading-5">
              {translate('mobile.workspace.delete.message', 'Delete "{{name}}" ({{branch}})?', {
                name: deleteTarget.displayName || deleteTarget.repo,
                branch: deleteTarget.branch
              })}
            </Text>
          </View>
          <MobileGlassGroup className="flex-row gap-2" spacing={8}>
            <MobileGlassTextButton
              className="flex-1"
              isFullWidth
              label={translate('mobile.common.cancel', 'Cancel')}
              onPress={() => setDeleteTarget(null)}
            />
            <MobileGlassTextButton
              className="flex-1"
              isDestructive
              isFullWidth
              label={translate('mobile.common.delete', 'Delete')}
              onPress={() => {
                void onDelete(deleteTarget)
                close()
              }}
            />
          </MobileGlassGroup>
        </View>
      ) : (
        <ActionSheetContent
          message={target?.branch}
          actions={
            target
              ? [
                  ...buildWorktreeNavigationActions({
                    hostId,
                    worktreeId: target.worktreeId,
                    worktreeName: target.displayName || target.repo,
                    hostCapabilities: hostCapabilities ?? [],
                    navigate,
                    onDone: close
                  }),
                  {
                    id: 'sleep',
                    label: translate('mobile.workspace.actions.sleep', 'Sleep'),
                    icon: Moon,
                    dismiss: 'manual',
                    onPress: () => {
                      onSleep(target)
                      close()
                    }
                  },
                  {
                    id: 'toggle-pin',
                    label: isPinned
                      ? translate('mobile.workspace.actions.unpin', 'Unpin')
                      : translate('mobile.workspace.actions.pin', 'Pin'),
                    icon: Pin,
                    dismiss: 'manual',
                    onPress: () => {
                      onTogglePin(target)
                      close()
                    }
                  },
                  {
                    id: 'delete',
                    label: translate('mobile.common.delete', 'Delete'),
                    icon: Trash,
                    dismiss: 'manual',
                    destructive: true,
                    onPress: () => setDeleteTarget(target)
                  }
                ]
              : []
          }
        />
      )}
    </BottomDrawer>
  )
}
