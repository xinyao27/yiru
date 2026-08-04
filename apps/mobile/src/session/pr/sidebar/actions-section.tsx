import type { GitHubPRMergeMethod, PRInfo } from '@yiru/workbench-model/review'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { ConfirmModal } from '~/components/confirm-modal'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { translate } from '~/i18n/translate'
import type { MobilePrActions } from '~/session/pr/use-actions'
import { unlinkMobilePr } from '~/source-control/pr-link'
import type { RpcClient } from '~/transport/rpc-client'

import { resolveMobilePrMergeMethod, resolvePrActionAvailability } from './actions-state'
import { canShowMobilePRAutoMergeControl } from './auto-merge-availability'

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
export function PRActionsSection({
  pr,
  actions,
  client,
  worktreeId,
  onUnlinked
}: Props): React.JSX.Element {
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
  const autoMergeLabel = translate('mobile.pullRequest.autoMerge.label', 'Auto-merge when ready')

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
      setUnlinkError(
        err instanceof Error
          ? err.message
          : translate('mobile.pullRequest.actions.unlink.error', 'Failed to unlink pull request.')
      )
    } finally {
      setUnlinking(false)
    }
  }, [client, onUnlinked, unlinking, worktreeId])

  const confirmCopy = (): { title: string; message: string; confirmLabel: string } => {
    if (confirm?.kind === 'merge') {
      return {
        title: translate('mobile.pullRequest.actions.merge.confirmTitle', 'Merge pull request?'),
        message: translate(
          'mobile.pullRequest.actions.merge.confirmMessage',
          'This will merge #{{number}} into its base branch.',
          { number: pr.number }
        ),
        confirmLabel: translate('mobile.pullRequest.actions.merge.confirmLabel', 'Merge')
      }
    }
    if (confirm?.kind === 'state' && confirm.state === 'closed') {
      return {
        title: translate('mobile.pullRequest.actions.close.confirmTitle', 'Close pull request?'),
        message: translate(
          'mobile.pullRequest.actions.close.confirmMessage',
          '#{{number}} will be closed without merging.',
          { number: pr.number }
        ),
        confirmLabel: translate('mobile.pullRequest.actions.close.confirmLabel', 'Close')
      }
    }
    return {
      title: translate('mobile.pullRequest.actions.reopen.confirmTitle', 'Reopen pull request?'),
      message: translate(
        'mobile.pullRequest.actions.reopen.confirmMessage',
        '#{{number}} will be reopened.',
        { number: pr.number }
      ),
      confirmLabel: translate('mobile.pullRequest.actions.reopen.confirmLabel', 'Reopen')
    }
  }

  const runConfirmed = (): void => {
    if (!confirm) {
      return
    }
    const pending = confirm
    setConfirm(null)
    // Engine errors take over the shared error line after this; drop unlink text.
    setUnlinkError(null)
    if (pending.kind === 'merge') {
      actions.merge(pending.method)
    } else {
      actions.updateState(pending.state)
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
            label={translate('mobile.pullRequest.actions.merge.label', 'Merge pull request')}
            onPress={() => {
              setUnlinkError(null)
              setConfirm({ kind: 'merge', method: effectiveMethod })
            }}
            accessibilityLabel={translate(
              'mobile.pullRequest.actions.merge.accessibilityLabel',
              'Merge pull request'
            )}
            size="large"
          />
        )
      ) : null}

      {showAutoMerge ? (
        <View className="min-h-11">
          {autoMergeBusy ? (
            <View className="min-h-11 flex-row items-center justify-between gap-2 px-5">
              <Text className="text-foreground shrink text-sm">{autoMergeLabel}</Text>
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            </View>
          ) : (
            <SettingsToggleRow
              label={autoMergeLabel}
              onValueChange={(enabled) => {
                setUnlinkError(null)
                actions.setAutoMerge(enabled, effectiveMethod)
              }}
              value={autoMerge}
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
                label={
                  avail.canClose
                    ? translate('mobile.pullRequest.actions.close.label', 'Close')
                    : translate('mobile.pullRequest.actions.reopen.label', 'Reopen')
                }
                onPress={() => {
                  setUnlinkError(null)
                  setConfirm({ kind: 'state', state: avail.canClose ? 'closed' : 'open' })
                }}
                accessibilityLabel={
                  avail.canClose
                    ? translate(
                        'mobile.pullRequest.actions.close.accessibilityLabel',
                        'Close pull request'
                      )
                    : translate(
                        'mobile.pullRequest.actions.reopen.accessibilityLabel',
                        'Reopen pull request'
                      )
                }
                size="regular"
              />
            )
          ) : null}
          {avail.canUnlink ? (
            unlinking ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <MobileGlassTextButton
                accessibilityLabel={translate(
                  'mobile.pullRequest.actions.unlink.accessibilityLabel',
                  'Unlink pull request'
                )}
                className="flex-1"
                disabled={unlinkBusy}
                isFullWidth
                label={translate('mobile.pullRequest.actions.unlink.label', 'Unlink')}
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
