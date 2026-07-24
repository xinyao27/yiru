import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { RepoIcon } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import {
  Bell,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  GitMerge,
  GitPullRequest
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { triggerMediumImpact } from '../platform/haptics'
import { spacing } from '../theme/uniwind-theme-values'
import { AgentSpinner } from './agent-spinner'
import { MobileRepoIcon } from './mobile-repo-icon'
import { WorktreeAgentList } from './worktree-agent-list'
import { WorktreeMetaGlyphs, prStateColorClasses } from './worktree-meta-glyphs'

// Strip the refs/heads/ prefix for display, matching the desktop sidebar
// (WorktreeCardHelpers.formatBranchName).
function displayBranch(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}

// Minimal row shape needed for rendering — a structural subset of the screen's
// Worktree so this component stays decoupled from the screen's local type.
export type WorktreeListRowItem = {
  workspaceKind?: 'git' | 'folder-workspace'
  worktreeId: string
  repo: string
  branch: string
  displayName: string
  path?: string
  liveTerminalCount: number
  preview: string
  unread: boolean
  isActive?: boolean
  linkedPR: { number: number; state: string } | null
  linkedGitLabMR?: number | null
  comment?: string
  lineageDepth?: number
  lineageChildCount?: number
  lineageCollapsed?: boolean
  agents?: RuntimeWorktreeAgentRow[]
}

type WorktreeRollupStatus = 'working' | 'active' | 'permission' | 'done' | 'inactive'

type Props<T extends WorktreeListRowItem> = {
  item: T
  isReadOnly: boolean
  now: number
  repoColor: string
  repoIcon?: RepoIcon | null
  // When the list is already grouped under this repo's section header, the row
  // omits its own repo icon+name to avoid the redundant "📁 yiru" on every row.
  hideRepo?: boolean
  status: WorktreeRollupStatus
  onPress: (item: T) => void
  onLongPress?: (item: T) => void
  onToggleLineage?: (item: T) => void
}

export function WorktreeListRow<T extends WorktreeListRowItem>({
  item,
  isReadOnly,
  now,
  repoColor,
  repoIcon,
  hideRepo = false,
  status,
  onPress,
  onLongPress,
  onToggleLineage
}: Props<T>) {
  const isFolderWorkspace = item.workspaceKind === 'folder-workspace'
  const folderMeta = item.comment?.trim() || item.path || 'Folder'
  const metaText = isFolderWorkspace ? folderMeta : displayBranch(item.branch)
  const lineageDepth = Math.max(0, item.lineageDepth ?? 0)
  const lineageChildCount = item.lineageChildCount ?? 0
  const linkedPrColors = item.linkedPR ? prStateColorClasses(item.linkedPR.state) : null

  return (
    <Pressable
      className={cn(
        styles.worktreeRow,
        item.isActive && styles.worktreeRowActive,
        styles.worktreeRowPressedActive
      )}
      style={lineageDepth > 0 ? { paddingLeft: spacing.lg + lineageDepth * 18 } : undefined}
      disabled={isReadOnly}
      onPress={() => onPress(item)}
      onLongPress={
        onLongPress
          ? () => {
              triggerMediumImpact()
              onLongPress(item)
            }
          : undefined
      }
      delayLongPress={400}
    >
      <View className={styles.indicatorCol}>
        <AgentSpinner status={status} />
        {item.unread && (
          <View className={styles.unreadBell}>
            <Bell size={10} colorClassName="accent-amber-500" />
          </View>
        )}
      </View>

      <View className={styles.worktreeMain}>
        <View className={styles.worktreeNameRow}>
          <Text
            className={cn(
              styles.worktreeName,
              item.unread && styles.worktreeNameUnread,
              isReadOnly && styles.textReadOnly
            )}
            numberOfLines={1}
          >
            {item.displayName || item.repo}
          </Text>
          {item.linkedPR && (
            <View className={styles.prBadge}>
              <GitPullRequest size={10} colorClassName={linkedPrColors?.accent} />
              <Text className={cn(styles.prNumber, linkedPrColors?.text)}>
                #{item.linkedPR.number}
              </Text>
            </View>
          )}
          {isFolderWorkspace && (
            <View className={styles.folderBadge}>
              <Text className={styles.folderBadgeText}>Folder</Text>
            </View>
          )}
          <WorktreeMetaGlyphs
            comment={item.comment}
            linkedPR={item.linkedPR?.number}
            linkedGitLabMR={item.linkedGitLabMR}
          />
        </View>
        <View className={styles.worktreeMetaRow}>
          {lineageDepth > 0 && (
            <View className={styles.childBadge}>
              <GitMerge size={10} colorClassName="accent-muted-foreground" />
              <Text className={styles.childBadgeText}>Child</Text>
            </View>
          )}
          {/* Repo glyph+name only when not already grouped under this repo;
              MobileRepoIcon falls back to a Folder (matching desktop's default)
              rather than a bare colored dot. */}
          {!hideRepo && (
            <>
              <MobileRepoIcon repoIcon={repoIcon} size={11} color={repoColor} />
              <Text className={styles.repoName} numberOfLines={1}>
                {item.repo}
              </Text>
            </>
          )}
          <Text className={styles.branchName} numberOfLines={1}>
            {metaText}
          </Text>
        </View>
        {/* Only agents get a secondary activity line, matching desktop. A plain
            terminal's shell-output tail is intentionally not surfaced here. */}
        {item.agents && item.agents.length > 0 ? (
          <WorktreeAgentList agents={item.agents} now={now} unvisited={item.unread} />
        ) : null}
        {lineageChildCount > 0 && onToggleLineage ? (
          <Pressable
            className={styles.lineageToggle}
            onPress={(event) => {
              event.stopPropagation()
              onToggleLineage(item)
            }}
          >
            {item.lineageCollapsed ? (
              <ChevronRight size={12} colorClassName="accent-muted-foreground" />
            ) : (
              <ChevronDown size={12} colorClassName="accent-muted-foreground" />
            )}
            <GitMerge size={12} colorClassName="accent-muted-foreground" />
            <Text className={styles.lineageToggleText}>
              {lineageChildCount} {lineageChildCount === 1 ? 'child' : 'children'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {item.liveTerminalCount > 0 && (
        <Text className={styles.terminalCount}>{item.liveTerminalCount}</Text>
      )}
    </Pressable>
  )
}

const styles = {
  // Reserve the active accent bar width so active/inactive rows align.
  worktreeRow: cn('flex-row items-start py-2.5 pl-4 pr-4 border-l-2 border-l-transparent'),
  worktreeRowPressedActive: cn('active:bg-secondary'),
  // Highlight the worktree currently focused on the desktop, mirroring the
  // desktop sidebar's selected-card treatment (raised fill + left accent).
  // Neutral grey accent, matching the desktop's active-tab indicator rather
  // than a blue line.
  worktreeRowActive: cn('bg-card border-l-muted-foreground'),
  // Why: the 12px status shell sits within the title's ~17px line box; 2px
  // centers it on the first line instead of letting it drift toward metadata.
  indicatorCol: cn('w-5 items-center pt-[2px] mr-2 gap-1'),
  unreadBell: cn('mt-[2px]'),
  worktreeMain: cn('flex-1 mr-2'),
  worktreeNameRow: cn('flex-row items-center gap-2'),
  worktreeName: cn('text-[14px] font-semibold text-foreground shrink'),
  worktreeNameUnread: cn('font-bold'),
  textReadOnly: cn('opacity-[0.5]'),
  prBadge: cn('flex-row items-center gap-[3px] bg-secondary px-[5px] py-[1px] rounded-none'),
  prNumber: cn('text-[10px] text-muted-foreground'),
  folderBadge: cn('bg-secondary px-[5px] py-[1px] rounded-none'),
  folderBadgeText: cn('text-[10px] text-muted-foreground'),
  worktreeMetaRow: cn('flex-row items-center mt-[2px] gap-1'),
  repoName: cn('text-[11px] text-muted-foreground max-w-[100px]'),
  branchName: cn('text-[11px] text-muted-foreground/60 font-mono shrink'),
  childBadge: cn('flex-row items-center gap-[3px] bg-secondary px-[5px] py-[1px] rounded-none'),
  childBadgeText: cn('text-[10px] text-muted-foreground/60'),
  lineageToggle: cn(
    'self-start flex-row items-center gap-1 mt-1 bg-secondary px-2 py-1 rounded-none'
  ),
  lineageToggleText: cn('text-[11px] text-muted-foreground font-semibold'),
  terminalCount: cn('text-[12px] text-muted-foreground/60 min-w-4 text-right pt-[3px]')
} as const
