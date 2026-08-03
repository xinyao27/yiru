import { translate } from '../i18n/translate'
import type { MobileGitUpstreamStatus } from './git-status'

// Icon identifier resolved to a Phosphor component by the screen. Kept as a
// string so this domain module stays independent from native UI code.
export type MobileSourceControlActionIcon =
  | 'commit'
  | 'push'
  | 'pull'
  | 'sync'
  | 'fetch'
  | 'publish'
  | 'rebase'
  | 'pr'
  | 'branch'
  | 'history'

export type MobileSourceControlAction = {
  id: string
  label: string
  iconKey: MobileSourceControlActionIcon
  dismiss: 'manual'
  disabled?: boolean
  hint?: string
  loading?: boolean
  onPress: () => void
}

export type MobileSourceControlActionArgs = {
  commitMessage: string
  stagedCount: number
  upstream: MobileGitUpstreamStatus | null
  upstreamKnown: boolean
  busyAction: string | null
  openingPath: string | null
  openingBranchPath: string | null
  prAvailable: boolean
  handlers: {
    commit: () => void
    commitPush: () => void
    commitSync: () => void
    push: () => void
    pull: () => void
    sync: () => void
    fetch: () => void
    publish: () => void
    fastForward: () => void
    rebase: () => void
    createPr: () => void
    pushAndCreatePr: () => void
    checkout: () => void
    history: () => void
  }
}

// Builds the source-control bottom-sheet action list. Enable/disable rules
// mirror the desktop primary-action gating.
export function buildMobileSourceControlActions(
  args: MobileSourceControlActionArgs
): MobileSourceControlAction[] {
  const { commitMessage, stagedCount, upstream, upstreamKnown, handlers } = args
  const hasMessage = commitMessage.trim().length > 0
  const hasStaged = stagedCount > 0
  const hasUpstream = upstream?.hasUpstream === true
  const ahead = upstream?.ahead ?? 0
  const behind = upstream?.behind ?? 0
  const busy =
    args.busyAction !== null || args.openingPath !== null || args.openingBranchPath !== null
  const commitHint = !hasStaged
    ? translate('mobile.sourceControl.actions.stageFirst', 'Stage at least one file')
    : !hasMessage
      ? translate('mobile.sourceControl.actions.enterMessage', 'Enter a commit message')
      : undefined
  const remoteHint = !upstreamKnown
    ? translate('mobile.sourceControl.actions.checkingBranch', 'Checking branch status...')
    : hasUpstream
      ? undefined
      : translate('mobile.sourceControl.actions.publishFirst', 'Publish Branch first')
  const prHint = !upstreamKnown
    ? translate('mobile.sourceControl.actions.checkingBranch', 'Checking branch status...')
    : !args.prAvailable
      ? translate(
          'mobile.sourceControl.actions.prUnavailable',
          'Pull requests are not available for this repo'
        )
      : undefined

  return [
    {
      id: 'commit',
      label: translate('mobile.sourceControl.actions.commit', 'Commit'),
      iconKey: 'commit',
      dismiss: 'manual',
      disabled: busy || !!commitHint,
      hint: commitHint,
      loading: args.busyAction === 'commit',
      onPress: handlers.commit
    },
    {
      id: 'commit-push',
      label: translate('mobile.sourceControl.actions.commitPush', 'Commit & Push'),
      iconKey: 'push',
      dismiss: 'manual',
      disabled: busy || !!commitHint || !upstreamKnown || !hasUpstream,
      hint: commitHint ?? remoteHint,
      loading: args.busyAction === 'commit-push',
      onPress: handlers.commitPush
    },
    {
      id: 'commit-sync',
      label: translate('mobile.sourceControl.actions.commitSync', 'Commit & Sync'),
      iconKey: 'sync',
      dismiss: 'manual',
      disabled: busy || !!commitHint || !upstreamKnown || !hasUpstream || behind === 0,
      hint:
        commitHint ??
        (!upstreamKnown || !hasUpstream
          ? remoteHint
          : behind === 0
            ? translate('mobile.sourceControl.actions.nothingToPull', 'Nothing to pull')
            : undefined),
      loading: args.busyAction === 'commit-sync',
      onPress: handlers.commitSync
    },
    {
      id: 'push',
      label:
        ahead > 0
          ? translate('mobile.sourceControl.actions.pushCount', 'Push ({{count}})', {
              count: ahead
            })
          : translate('mobile.sourceControl.actions.push', 'Push'),
      iconKey: 'push',
      dismiss: 'manual',
      disabled: busy || !upstreamKnown || !hasUpstream || ahead === 0,
      hint: !hasUpstream
        ? remoteHint
        : ahead === 0
          ? translate('mobile.sourceControl.actions.nothingToPush', 'Nothing to push')
          : undefined,
      loading: args.busyAction === 'push',
      onPress: handlers.push
    },
    {
      id: 'create-pr',
      label: translate('mobile.sourceControl.actions.createPr', 'Create PR'),
      iconKey: 'pr',
      dismiss: 'manual',
      disabled: busy || !args.prAvailable,
      hint: prHint,
      loading: args.busyAction === 'create-pr',
      onPress: handlers.createPr
    },
    {
      id: 'push-create-pr',
      label: translate('mobile.sourceControl.actions.pushCreatePr', 'Push & Create PR'),
      iconKey: 'pr',
      dismiss: 'manual',
      disabled: busy || !upstreamKnown || !hasUpstream || ahead === 0 || !args.prAvailable,
      hint: prHint ?? (!hasUpstream ? remoteHint : undefined),
      loading: args.busyAction === 'push-create-pr',
      onPress: handlers.pushAndCreatePr
    },
    {
      id: 'pull',
      label:
        behind > 0
          ? translate('mobile.sourceControl.actions.pullCount', 'Pull ({{count}})', {
              count: behind
            })
          : translate('mobile.sourceControl.actions.pull', 'Pull'),
      iconKey: 'pull',
      dismiss: 'manual',
      disabled: busy || !upstreamKnown || !hasUpstream || behind === 0,
      hint: !hasUpstream
        ? remoteHint
        : behind === 0
          ? translate('mobile.sourceControl.actions.nothingToPull', 'Nothing to pull')
          : undefined,
      loading: args.busyAction === 'pull',
      onPress: handlers.pull
    },
    {
      id: 'sync',
      label:
        ahead > 0 || behind > 0
          ? translate('mobile.sourceControl.actions.syncCounts', 'Sync (↓{{behind}} ↑{{ahead}})', {
              ahead,
              behind
            })
          : translate('mobile.sourceControl.actions.sync', 'Sync'),
      iconKey: 'sync',
      dismiss: 'manual',
      disabled: busy || !upstreamKnown || !hasUpstream || (ahead === 0 && behind === 0),
      hint:
        !upstreamKnown || !hasUpstream
          ? remoteHint
          : ahead === 0 && behind === 0
            ? translate('mobile.sourceControl.actions.upToDate', 'Branch is up to date')
            : undefined,
      loading: args.busyAction === 'sync',
      onPress: handlers.sync
    },
    {
      id: 'fetch',
      label: translate('mobile.sourceControl.actions.fetch', 'Fetch'),
      iconKey: 'fetch',
      dismiss: 'manual',
      disabled: busy,
      loading: args.busyAction === 'fetch',
      onPress: handlers.fetch
    },
    {
      id: 'publish',
      label: translate('mobile.sourceControl.actions.publishBranch', 'Publish Branch'),
      iconKey: 'publish',
      dismiss: 'manual',
      disabled: busy || !upstreamKnown || hasUpstream,
      hint: !upstreamKnown
        ? translate('mobile.sourceControl.actions.checkingBranch', 'Checking branch status...')
        : hasUpstream
          ? translate(
              'mobile.sourceControl.actions.alreadyPublished',
              'Branch is already published'
            )
          : undefined,
      loading: args.busyAction === 'publish',
      onPress: handlers.publish
    },
    {
      id: 'fast-forward',
      label:
        behind > 0
          ? translate('mobile.sourceControl.actions.fastForwardCount', 'Fast-forward ({{count}})', {
              count: behind
            })
          : translate('mobile.sourceControl.actions.fastForward', 'Fast-forward'),
      iconKey: 'pull',
      dismiss: 'manual',
      disabled: busy || !upstreamKnown || !hasUpstream || behind === 0 || ahead > 0,
      hint: !hasUpstream
        ? remoteHint
        : behind === 0
          ? translate(
              'mobile.sourceControl.actions.nothingToFastForward',
              'Nothing to fast-forward'
            )
          : ahead > 0
            ? translate(
                'mobile.sourceControl.actions.fastForwardWouldLoseCommits',
                'Local commits would be lost; pull instead'
              )
            : undefined,
      loading: args.busyAction === 'fast-forward',
      onPress: handlers.fastForward
    },
    {
      id: 'rebase',
      label: translate('mobile.sourceControl.actions.rebaseOntoBase', 'Rebase onto base'),
      iconKey: 'branch',
      dismiss: 'manual',
      disabled: busy,
      loading: args.busyAction === 'rebase',
      onPress: handlers.rebase
    },
    {
      id: 'checkout',
      label: translate('mobile.sourceControl.actions.switchBranch', 'Switch branch'),
      iconKey: 'branch',
      dismiss: 'manual',
      disabled: busy,
      onPress: handlers.checkout
    },
    {
      id: 'history',
      label: translate('mobile.sourceControl.actions.commits', 'Commits'),
      iconKey: 'history',
      dismiss: 'manual',
      disabled: busy,
      onPress: handlers.history
    }
  ]
}
