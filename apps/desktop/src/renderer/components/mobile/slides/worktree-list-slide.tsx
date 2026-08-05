import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { ClaudeIcon, GeminiIcon } from '~renderer/components/status-bar/icons'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

import { mobileWorktreePreviewStyles } from '../worktree-preview-tailwind'

type RepoIconKind = 'bird' | 'cat' | 'folder' | 'pocket'
type WorkspaceStatus = 'idle' | 'working'
type AgentIconKind = 'claude' | 'gemini'

type PreviewText = {
  key: string
  fallback: string
}

type PreviewAgent = {
  icon: AgentIconKind
  label: PreviewText
  state: WorkspaceStatus
  time: PreviewText
}

type PreviewRepository = {
  branch?: PreviewText
  branchStatus?: WorkspaceStatus
  comment?: boolean
  expanded: boolean
  icon: RepoIconKind
  name: PreviewText
  agents?: PreviewAgent[]
}

const previewRepositories: PreviewRepository[] = [
  {
    branch: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.main',
      fallback: 'main'
    },
    branchStatus: 'working',
    expanded: true,
    icon: 'cat',
    name: { key: 'auto.components.mobile.slides.WorktreeListSlide.preview.yiru', fallback: 'yiru' },
    agents: [
      {
        icon: 'claude',
        label: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.screenshotPath',
          fallback: '/Users/xinyao27/Downloads/截屏…'
        },
        state: 'working',
        time: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.oneMinute',
          fallback: '1m'
        }
      }
    ]
  },
  {
    expanded: false,
    icon: 'pocket',
    name: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.pocketjs',
      fallback: 'pocketjs'
    }
  },
  {
    expanded: false,
    icon: 'bird',
    name: { key: 'auto.components.mobile.slides.WorktreeListSlide.preview.cat', fallback: 'cat' }
  },
  {
    branch: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.main',
      fallback: 'main'
    },
    branchStatus: 'idle',
    comment: true,
    expanded: true,
    icon: 'folder',
    name: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.reactvapor',
      fallback: 'reactvapor'
    },
    agents: [
      {
        icon: 'claude',
        label: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.completedCommit',
          fallback: '已完成 D1 收口，本地提交 `391a6…'
        },
        state: 'idle',
        time: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.sixHours',
          fallback: '6h'
        }
      },
      {
        icon: 'gemini',
        label: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.architectureDocument',
          fallback: '架构文档已写入 `ARCHITECTURE…'
        },
        state: 'idle',
        time: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.twoHours',
          fallback: '2h'
        }
      }
    ]
  },
  {
    branch: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.main',
      fallback: 'main'
    },
    branchStatus: 'working',
    expanded: true,
    icon: 'bird',
    name: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.paperboy',
      fallback: 'paperboy'
    },
    agents: [
      {
        icon: 'claude',
        label: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.publish',
          fallback: 'publish'
        },
        state: 'working',
        time: {
          key: 'auto.components.mobile.slides.WorktreeListSlide.preview.twoMinutes',
          fallback: '2m'
        }
      }
    ]
  },
  {
    branch: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.main',
      fallback: 'main'
    },
    branchStatus: 'idle',
    expanded: true,
    icon: 'cat',
    name: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.mybrain',
      fallback: 'mybrain'
    }
  },
  {
    branch: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.main',
      fallback: 'main'
    },
    branchStatus: 'idle',
    expanded: true,
    icon: 'bird',
    name: {
      key: 'auto.components.mobile.slides.WorktreeListSlide.preview.spool',
      fallback: 'spool'
    }
  }
]

export function WorktreeListSlide({ tapping }: { tapping: boolean }): React.JSX.Element {
  return (
    <div className={mobileWorktreePreviewStyles.deviceScreen}>
      <div className={mobileWorktreePreviewStyles.chrome}>
        <div className={mobileWorktreePreviewStyles.statusRow}>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            className={cn(
              'h-auto border-0 p-0 focus-visible:bg-accent',
              mobileWorktreePreviewStyles.back
            )}
            aria-label={translate(
              'auto.components.mobile.slides.WorktreeListSlide.cefd048225',
              'Back'
            )}
          >
            <ChevronLeftIcon />
          </Button>
          <div className={mobileWorktreePreviewStyles.hostName}>
            {translate('auto.components.mobile.slides.WorktreeListSlide.preview.host', 'Host 1')}
          </div>
          <div className={mobileWorktreePreviewStyles.headerActions}>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className={cn(
                'h-auto border-0 p-0 focus-visible:bg-accent',
                mobileWorktreePreviewStyles.headerAction
              )}
              aria-label={translate(
                'auto.components.mobile.slides.WorktreeListSlide.preview.search',
                'Search workspaces'
              )}
            >
              <SearchIcon />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className={cn(
                'h-auto border-0 p-0 focus-visible:bg-accent',
                mobileWorktreePreviewStyles.headerAction
              )}
              aria-label={translate(
                'auto.components.mobile.slides.WorktreeListSlide.preview.more',
                'More actions'
              )}
            >
              <MoreIcon />
            </Button>
          </div>
        </div>
      </div>

      <div className={mobileWorktreePreviewStyles.listViewport}>
        {previewRepositories.map((repository) => (
          <RepositorySection key={repository.name.key} repository={repository} tapping={tapping} />
        ))}
      </div>
    </div>
  )
}

function RepositorySection({
  repository,
  tapping
}: {
  repository: PreviewRepository
  tapping: boolean
}): React.JSX.Element {
  return (
    <section
      className={cn(
        mobileWorktreePreviewStyles.repository,
        tapping && mobileWorktreePreviewStyles.tapping
      )}
    >
      <div className={mobileWorktreePreviewStyles.repositoryRow}>
        <RepoIcon kind={repository.icon} />
        <span className={mobileWorktreePreviewStyles.repositoryName}>
          {translate(repository.name.key, repository.name.fallback)}
        </span>
        <ChevronDownIcon className={mobileWorktreePreviewStyles.repositoryChevron} />
      </div>
      {repository.expanded && repository.branch ? (
        <div className={mobileWorktreePreviewStyles.workspaceTree}>
          <div className={mobileWorktreePreviewStyles.workspaceRow}>
            <div className={mobileWorktreePreviewStyles.workspaceStatus}>
              <WorkspaceStatusIcon status={repository.branchStatus ?? 'idle'} />
            </div>
            <div className={mobileWorktreePreviewStyles.workspaceMain}>
              <div className={mobileWorktreePreviewStyles.branchRow}>
                <span>{translate(repository.branch.key, repository.branch.fallback)}</span>
                {repository.comment ? <ChatIcon /> : null}
              </div>
              {repository.agents?.length ? (
                <div className={mobileWorktreePreviewStyles.agentTree}>
                  {repository.agents.map((agent, index) => (
                    <AgentPreviewRow key={`${agent.label.key}-${index}`} agent={agent} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function AgentPreviewRow({ agent }: { agent: PreviewAgent }): React.JSX.Element {
  return (
    <div className={mobileWorktreePreviewStyles.agentRow}>
      <div className={mobileWorktreePreviewStyles.agentIcon}>
        {agent.icon === 'claude' ? <ClaudeIcon size={16} /> : <GeminiIcon size={16} />}
      </div>
      <span className={mobileWorktreePreviewStyles.agentLabel}>
        {translate(agent.label.key, agent.label.fallback)}
      </span>
      <span className={mobileWorktreePreviewStyles.agentTime}>
        {translate(agent.time.key, agent.time.fallback)}
      </span>
      <div className={mobileWorktreePreviewStyles.agentState}>
        <WorkspaceStatusIcon status={agent.state} />
      </div>
    </div>
  )
}

function WorkspaceStatusIcon({ status }: { status: WorkspaceStatus }): React.JSX.Element {
  if (status === 'working') {
    return <LoadingIndicator className="size-3.5" />
  }
  return <span className={mobileWorktreePreviewStyles.doneDot} />
}

function RepoIcon({ kind }: { kind: RepoIconKind }): React.JSX.Element {
  if (kind === 'folder') {
    return <FolderIcon />
  }
  const glyph = kind === 'cat' ? '🐈' : kind === 'bird' ? '🪽' : '▣'
  return <span className={mobileWorktreePreviewStyles.repositoryEmoji}>{glyph}</span>
}

function ChevronLeftIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  )
}

function MoreIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r=".75" fill="currentColor" />
      <circle cx="12" cy="12" r=".75" fill="currentColor" />
      <circle cx="16" cy="12" r=".75" fill="currentColor" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function FolderIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2h8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
    </svg>
  )
}

function ChatIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5.5 4v-4.5a2.5 2.5 0 0 1-1.5-2.3Z" />
    </svg>
  )
}
