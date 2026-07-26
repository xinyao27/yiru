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
import { MobileRepoIcon } from './repo-icon'
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
    // Why: reserve the left border in every row so the active accent never shifts content.
    <Pressable
      className={cn(
        'flex-row items-start py-2.5 pl-4 pr-4 border-l-2 border-l-transparent',
        item.isActive && 'bg-card border-l-muted-foreground',
        'active:bg-accent'
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
      {/* Why: 2px centers the 12px status shell on the title's first line. */}
      <View className="mr-2 w-5 items-center gap-1 pt-[2px]">
        <AgentSpinner status={status} />
        {item.unread && (
          <View className="mt-[2px]">
            <Bell size={10} colorClassName="accent-amber-500" />
          </View>
        )}
      </View>

      <View className="mr-2 flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className={cn(
              'text-sm font-semibold text-foreground shrink',
              item.unread && 'font-bold',
              isReadOnly && 'opacity-[0.5]'
            )}
            numberOfLines={1}
          >
            {item.displayName || item.repo}
          </Text>
          {item.linkedPR && (
            <View className="bg-secondary flex-row items-center gap-[3px] px-[5px] py-[1px]">
              <GitPullRequest size={10} colorClassName={linkedPrColors?.accent} />
              <Text className={cn('text-[10px] text-muted-foreground', linkedPrColors?.text)}>
                #{item.linkedPR.number}
              </Text>
            </View>
          )}
          {isFolderWorkspace && (
            <View className="bg-secondary px-[5px] py-[1px]">
              <Text className="text-muted-foreground text-[10px]">Folder</Text>
            </View>
          )}
          <WorktreeMetaGlyphs
            comment={item.comment}
            linkedPR={item.linkedPR?.number}
            linkedGitLabMR={item.linkedGitLabMR}
          />
        </View>
        <View className="mt-[2px] flex-row items-center gap-1">
          {lineageDepth > 0 && (
            <View className="bg-secondary flex-row items-center gap-[3px] px-[5px] py-[1px]">
              <GitMerge size={10} colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground/60 text-[10px]">Child</Text>
            </View>
          )}
          {/* Repo glyph+name only when not already grouped under this repo;
              MobileRepoIcon falls back to a Folder (matching desktop's default)
              rather than a bare colored dot. */}
          {!hideRepo && (
            <>
              <MobileRepoIcon repoIcon={repoIcon} size={11} color={repoColor} />
              <Text className="text-muted-foreground max-w-[100px] text-[11px]" numberOfLines={1}>
                {item.repo}
              </Text>
            </>
          )}
          <Text className="text-muted-foreground/60 shrink font-mono text-[11px]" numberOfLines={1}>
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
            className="bg-secondary mt-1 flex-row items-center gap-1 self-start px-2 py-1"
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
            <Text className="text-muted-foreground text-[11px] font-semibold">
              {lineageChildCount} {lineageChildCount === 1 ? 'child' : 'children'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {item.liveTerminalCount > 0 && (
        <Text className="text-muted-foreground/60 min-w-4 pt-[3px] text-right text-xs">
          {item.liveTerminalCount}
        </Text>
      )}
    </Pressable>
  )
}
