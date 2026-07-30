import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { RepoIcon } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import {
  Bell,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  GitMerge,
  GitPullRequest
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'
import { resolveCssNumber } from '@/style/resolve-css-variable'

import { triggerMediumImpact } from '../platform/haptics'
import { AgentSpinner } from './agent-spinner'
import { MobileGlassPressable } from './glass/pressable'
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
  nestedUnderProject?: boolean
  isLastProjectWorkspace?: boolean
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
  nestedUnderProject = false,
  isLastProjectWorkspace = false,
  status,
  onPress,
  onLongPress,
  onToggleLineage
}: Props<T>) {
  const spacing4 = resolveCssNumber(useCSSVariable('--spacing-4'))
  const isFolderWorkspace = item.workspaceKind === 'folder-workspace'
  const folderMeta = item.comment?.trim() || item.path || 'Folder'
  const metaText = isFolderWorkspace ? folderMeta : displayBranch(item.branch)
  const lineageDepth = Math.max(0, item.lineageDepth ?? 0)
  const lineageChildCount = item.lineageChildCount ?? 0
  const linkedPrColors = item.linkedPR ? prStateColorClasses(item.linkedPR.state) : null

  return (
    <Pressable
      className={cn('mx-3 flex-row items-start gap-2 rounded-xl px-2 py-3', 'active:bg-accent')}
      style={
        lineageDepth > 0 && !nestedUnderProject
          ? { paddingLeft: spacing4 * (lineageDepth + 1) }
          : undefined
      }
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
      {nestedUnderProject ? (
        <View className="-my-3 w-5 items-center self-stretch">
          <View className={cn('bg-border w-hairline', isLastProjectWorkspace ? 'h-6' : 'flex-1')} />
        </View>
      ) : null}

      <View
        className="w-5"
        style={
          lineageDepth > 0 && nestedUnderProject
            ? { marginLeft: spacing4 * lineageDepth }
            : undefined
        }
      >
        <View className="h-6 items-center justify-center">
          <AgentSpinner status={status} />
        </View>
      </View>

      <View className="min-w-0 flex-1">
        <View className="min-h-6 flex-row items-center gap-2">
          <Text
            className={cn('text-foreground shrink text-base', isReadOnly && 'opacity-50')}
            numberOfLines={1}
          >
            {item.displayName || item.repo}
          </Text>
          {item.linkedPR && (
            <View className="bg-secondary flex-row items-center gap-1 rounded-full px-2 py-1">
              <GitPullRequest size={14} colorClassName={linkedPrColors?.accent} />
              <Text className={cn('text-muted-foreground text-sm', linkedPrColors?.text)}>
                #{item.linkedPR.number}
              </Text>
            </View>
          )}
          {isFolderWorkspace && (
            <View className="bg-secondary rounded-full px-2 py-1">
              <Text className="text-muted-foreground text-xs">Folder</Text>
            </View>
          )}
          <WorktreeMetaGlyphs
            comment={item.comment}
            linkedPR={item.linkedPR?.number}
            linkedGitLabMR={item.linkedGitLabMR}
          />
        </View>
        <View className="min-h-5 flex-row items-center gap-1">
          {lineageDepth > 0 && (
            <View className="bg-secondary flex-row items-center gap-1 rounded-full px-2 py-1">
              <GitMerge size={14} colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground text-xs">Child</Text>
            </View>
          )}
          {/* Repo glyph+name only when not already grouped under this repo;
              MobileRepoIcon falls back to a Folder (matching desktop's default)
              rather than a bare colored dot. */}
          {!hideRepo && (
            <>
              <MobileRepoIcon repoIcon={repoIcon} size={14} color={repoColor} />
              <Text className="text-muted-foreground max-w-24 text-sm" numberOfLines={1}>
                {item.repo}
              </Text>
            </>
          )}
          <Text className="text-muted-foreground shrink text-sm" numberOfLines={1}>
            {metaText}
          </Text>
        </View>
        {/* Only agents get a secondary activity line, matching desktop. A plain
            terminal's shell-output tail is intentionally not surfaced here. */}
        {item.agents && item.agents.length > 0 ? (
          <WorktreeAgentList agents={item.agents} now={now} unvisited={item.unread} />
        ) : null}
        {lineageChildCount > 0 && onToggleLineage ? (
          <MobileGlassPressable
            className="mt-1 self-start rounded-full"
            contentClassName="flex-row items-center gap-1 rounded-full px-2 py-1"
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
            <Text className="text-muted-foreground text-xs">
              {lineageChildCount} {lineageChildCount === 1 ? 'child' : 'children'}
            </Text>
          </MobileGlassPressable>
        ) : null}
      </View>

      <View className="w-5 items-center">
        {item.unread ? (
          <View className="h-6 items-center justify-center">
            <Bell size={14} colorClassName="accent-amber-500" weight="fill" />
          </View>
        ) : null}
        {item.liveTerminalCount > 0 ? (
          <View className="h-5 items-center justify-center">
            <Text className="text-muted-foreground text-sm">{item.liveTerminalCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
