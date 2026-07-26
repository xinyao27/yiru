import type { GitHubPRMergeMethod, PRInfo } from '@yiru/workbench-model/review'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { GitMerge, LinkBreak as Link2Off } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobilePrActions } from '../../session/pr/use-actions'
import { unlinkMobilePr } from '../../source-control/pr-link'
import type { RpcClient } from '../../transport/rpc-client'
import { ConfirmModal } from '../confirm-modal'
import { resolveMobilePrMergeMethod, resolvePrActionAvailability } from './pr-actions-state'
import { prActionsStyles as styles } from './pr-actions-styles'
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
        <Pressable
          className={cn(
            styles.actionButton,
            'bg-green-600 border-green-600',
            mergeBusy && styles.actionButtonDisabled
          )}
          onPress={() => {
            setUnlinkError(null)
            setConfirm({ kind: 'merge', method: effectiveMethod })
          }}
          disabled={mergeBusy}
          accessibilityRole="button"
          accessibilityLabel="Merge pull request"
        >
          {mergeBusy ? (
            <ActivityIndicator colorClassName="accent-white" />
          ) : (
            <GitMerge size={16} colorClassName="accent-white" />
          )}
          <Text className={cn(styles.actionButtonText, 'text-white')}>Merge pull request</Text>
        </Pressable>
      ) : null}

      {showAutoMerge ? (
        <View className="min-h-11 flex-row items-center justify-between gap-2">
          <Text className="text-foreground shrink text-sm">Auto-merge when ready</Text>
          <Pressable
            className={cn(
              'border-hairline border-border bg-card min-h-8 min-w-14 items-center justify-center rounded-full px-2',
              autoMerge && 'border-muted-foreground bg-secondary'
            )}
            onPress={() => {
              setUnlinkError(null)
              actions.setAutoMerge(!autoMerge, effectiveMethod)
            }}
            disabled={autoMergeBusy}
            accessibilityRole="switch"
            accessibilityState={{ checked: autoMerge }}
            accessibilityLabel="Toggle auto-merge"
          >
            {autoMergeBusy ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <Text
                className={cn(
                  'text-xs font-bold text-muted-foreground',
                  autoMerge && 'text-foreground'
                )}
              >
                {autoMerge ? 'On' : 'Off'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {showSecondary ? (
        <View className="flex-row items-stretch gap-2">
          {avail.canClose || avail.canReopen ? (
            <Pressable
              className={cn(
                styles.actionButton,
                styles.secondaryButton,
                stateBusy && styles.actionButtonDisabled
              )}
              onPress={() => {
                setUnlinkError(null)
                setConfirm({ kind: 'state', state: avail.canClose ? 'closed' : 'open' })
              }}
              disabled={stateBusy}
              accessibilityRole="button"
              accessibilityLabel={avail.canClose ? 'Close pull request' : 'Reopen pull request'}
            >
              {stateBusy ? <ActivityIndicator colorClassName="accent-muted-foreground" /> : null}
              <Text className={cn(styles.actionButtonText, avail.canClose && 'text-destructive')}>
                {avail.canClose ? 'Close' : 'Reopen'}
              </Text>
            </Pressable>
          ) : null}
          {avail.canUnlink ? (
            <Pressable
              className={cn(
                styles.actionButton,
                styles.secondaryButton,
                unlinkBusy && styles.actionButtonDisabled
              )}
              onPress={() => void unlink()}
              disabled={unlinkBusy}
              accessibilityRole="button"
              accessibilityLabel="Unlink pull request"
            >
              {unlinking ? (
                <ActivityIndicator colorClassName="accent-muted-foreground" />
              ) : (
                <Link2Off size={16} colorClassName="accent-muted-foreground" />
              )}
              <Text className={styles.actionButtonText}>Unlink</Text>
            </Pressable>
          ) : null}
        </View>
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
