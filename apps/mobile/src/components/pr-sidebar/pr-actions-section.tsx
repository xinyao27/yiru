import type { GitHubPRMergeMethod, PRInfo } from '@yiru/workbench-model/review'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Switch, Text, View } from 'react-native'

import type { MobilePrActions } from '~/session/pr/use-actions'
import { unlinkMobilePr } from '~/source-control/pr-link'
import type { RpcClient } from '~/transport/rpc-client'

import { ConfirmModal } from '../confirm-modal'
import { MobileGlassGroup } from '../glass/group'
import { MobileGlassTextButton } from '../glass/text-button'
import { resolveMobilePrMergeMethod, resolvePrActionAvailability } from './pr-actions-state'
import { canShowMobilePRAutoMergeControl } from './pr-auto-merge-availability'

type Props = {
  pr: PRInfo
  actions: MobilePrActions
  client: RpcClient | null
  worktreeId: string
  // Refetch after unlinking so the view returns to the create/link empty state.
  onUnlinked: () => void
}

type Confirm =
  | { kind: 'merge'; method: GitHubPRMergeMethod }
  | { kind: 'state'; state: 'open' | 'closed' }

// Merge primary; Close/Reopen + Unlink share one secondary row. No section title —
// button labels are self-explanatory and a header wasted a full row on mobile.
export function PRActionsSection({ pr, actions, client, worktreeId, onUnlinked }: Props) {
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  // Local unlink errors — unlink is not routed through the actions engine.
  const [unlinkError, setUnlinkError] = useState<string | null>(null)

  // Mobile keeps merge one-tap: use the repo default instead of surfacing a
  // desktop-style method picker in the narrow PR action stack.
  const effectiveMethod = resolveMobilePrMergeMethod(pr.mergeMethodSettings)
  const state = actions.resolveState(pr.state)
  const autoMerge = actions.resolveAutoMerge(pr.autoMergeEnabled ?? false)
  const avail = resolvePrActionAvailability(state)
  const mergeBusy = actions.isBusy({ kind: 'merge' })
  const autoMergeBusy = actions.isBusy({ kind: 'autoMerge' })
  const stateBusy = actions.isBusy({ kind: 'state' })
  const unlinkBusy = unlinking || mergeBusy || autoMergeBusy || stateBusy
  const showAutoMerge =
    avail.canAutoMerge &&
    canShowMobilePRAutoMergeControl({
      ...pr,
      autoMergeEnabled: autoMerge || pr.autoMergeEnabled === true
    })
  const showSecondary = avail.canClose || avail.canReopen || avail.canUnlink
  const actionError = unlinkError ?? actions.error

  const unlink = useCallback(async (): Promise<void> => {
    if (!client || unlinking) {
      return
    }
    setUnlinking(true)
    setUnlinkError(null)
    try {
      const outcome = await unlinkMobilePr(client, worktreeId)
      if (outcome.ok) {
        onUnlinked()
      } else {
        setUnlinkError(outcome.error)
      }
    } catch (err) {
      setUnlinkError(err instanceof Error ? err.message : 'Failed to unlink pull request.')
    } finally {
      setUnlinking(false)
    }
  }, [client, onUnlinked, unlinking, worktreeId])

  const confirmCopy = (): { title: string; message: string; confirmLabel: string } => {
    if (confirm?.kind === 'merge') {
      return {
        title: 'Merge pull request?',
        message: `This will merge #${pr.number} into its base branch.`,
        confirmLabel: 'Merge'
      }
    }
    if (confirm?.kind === 'state' && confirm.state === 'closed') {
      return {
        title: 'Close pull request?',
        message: `#${pr.number} will be closed without merging.`,
        confirmLabel: 'Close'
      }
    }
    return {
      title: 'Reopen pull request?',
      message: `#${pr.number} will be reopened.`,
      confirmLabel: 'Reopen'
    }
  }

  const runConfirmed = (): void => {
    if (!confirm) {
      return
    }
    // Engine errors take over the shared error line after this; drop unlink text.
    setUnlinkError(null)
    if (confirm.kind === 'merge') {
      actions.merge(confirm.method)
    } else {
      actions.updateState(confirm.state)
    }
  }

  const copy = confirmCopy()

  return (
    <View className="gap-2">
      {avail.canMerge ? (
        mergeBusy ? (
          <View className="min-h-11 items-center justify-center">
            <ActivityIndicator colorClassName="accent-muted-foreground" />
          </View>
        ) : (
          <MobileGlassTextButton
            isFullWidth
            isProminent
            label="Merge pull request"
            onPress={() => {
              setUnlinkError(null)
              setConfirm({ kind: 'merge', method: effectiveMethod })
            }}
            accessibilityLabel="Merge pull request"
            size="large"
          />
        )
      ) : null}

      {showAutoMerge ? (
        <View className="min-h-11 flex-row items-center justify-between gap-2">
          <Text className="text-foreground shrink text-sm">Auto-merge when ready</Text>
          {autoMergeBusy ? (
            <ActivityIndicator colorClassName="accent-muted-foreground" />
          ) : (
            <Switch
              value={autoMerge}
              onValueChange={(enabled) => {
                setUnlinkError(null)
                actions.setAutoMerge(enabled, effectiveMethod)
              }}
              disabled={autoMergeBusy}
              accessibilityLabel="Toggle auto-merge"
              trackColorOffClassName="accent-secondary"
              trackColorOnClassName="accent-muted-foreground"
              thumbColorClassName="accent-foreground"
              ios_backgroundColorClassName="accent-secondary"
            />
          )}
        </View>
      ) : null}

      {showSecondary ? (
        <MobileGlassGroup className="flex-row items-stretch gap-2" spacing={8}>
          {avail.canClose || avail.canReopen ? (
            stateBusy ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <MobileGlassTextButton
                className="flex-1"
                isDestructive={avail.canClose}
                isFullWidth
                label={avail.canClose ? 'Close' : 'Reopen'}
                onPress={() => {
                  setUnlinkError(null)
                  setConfirm({ kind: 'state', state: avail.canClose ? 'closed' : 'open' })
                }}
                accessibilityLabel={avail.canClose ? 'Close pull request' : 'Reopen pull request'}
                size="regular"
              />
            )
          ) : null}
          {avail.canUnlink ? (
            unlinking ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <MobileGlassTextButton
                accessibilityLabel="Unlink pull request"
                className="flex-1"
                disabled={unlinkBusy}
                isFullWidth
                label="Unlink"
                onPress={() => void unlink()}
                size="regular"
              />
            )
          ) : null}
        </MobileGlassGroup>
      ) : null}

      {actionError ? (
        <Text className="text-destructive text-xs leading-5">{actionError}</Text>
      ) : null}

      <ConfirmModal
        visible={confirm !== null}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.confirmLabel}
        destructive={confirm?.kind === 'state' && confirm.state === 'closed'}
        onConfirm={runConfirmed}
        onCancel={() => setConfirm(null)}
      />
    </View>
  )
}
