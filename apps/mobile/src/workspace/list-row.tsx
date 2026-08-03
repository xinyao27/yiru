import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { RepoIcon } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { MobileGlassPressable } from '~/components/glass/pressable'
import { MobileRepoIcon } from '~/components/repo-icon'
import {
  BellSimple,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  GitMerge,
  GitPullRequest
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'
import { resolveCssNumber } from '~/style/resolve-css-variable'

import { triggerMediumImpact } from '../platform/haptics'
import { WorkspaceAgentList } from './agent-list'
import { AgentSpinner } from './agent-spinner'
import { WorkspaceMetaGlyphs, prStateColorClasses } from './meta-glyphs'

// Minimal row shape needed for rendering — a structural subset of the screen's
// Worktree so this component stays decoupled from the screen's local type.
export type WorkspaceListRowItem = {
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

const PROJECT_RAIL_STATUS_CENTER_TOP_PT = 16
const PROJECT_RAIL_BASE_ELBOW_WIDTH_PT = 12

type WorkspaceLeadingStatusProps = {
  branch: string
  linkedPR: WorkspaceListRowItem['linkedPR']
  status: WorktreeRollupStatus
}

function WorkspaceLeadingStatus(props: WorkspaceLeadingStatusProps): React.JSX.Element {
  const { branch, linkedPR, status } = props

  if (status === 'working' || status === 'permission') {
    return <AgentSpinner status={status} />
  }
  if (linkedPR) {
    const colors = prStateColorClasses(linkedPR.state)
    return <GitPullRequest size={16} colorClassName={colors.accent} />
  }
  if (branch.trim()) {
    return <GitMerge size={16} colorClassName="accent-muted-foreground" />
  }
  return <AgentSpinner status={status} />
}

type Props<T extends WorkspaceListRowItem> = {
  item: T
  isReadOnly: boolean
  now: number
  repoIcon?: RepoIcon | null
  // When the list is already grouped under this repo's section header, the row
  // omits its own repo icon+name to avoid the redundant "📁 yiru" on every row.
  hideRepo?: boolean
  nestedUnderProject?: boolean
  endsProjectRail?: boolean
  status: WorktreeRollupStatus
  onPress: (item: T) => void
  onLongPress?: (item: T) => void
  onToggleLineage?: (item: T) => void
}

export function WorkspaceListRow<T extends WorkspaceListRowItem>({
  item,
  isReadOnly,
  now,
  repoIcon,
  hideRepo = false,
  nestedUnderProject = false,
  endsProjectRail = false,
  status,
  onPress,
  onLongPress,
  onToggleLineage
}: Props<T>) {
  const spacing4 = resolveCssNumber(useCSSVariable('--spacing-4'))
  const isFolderWorkspace = item.workspaceKind === 'folder-workspace'
  const folderMeta = isFolderWorkspace
    ? item.comment?.trim() || item.path || translate('mobile.workspace.folder', 'Folder')
    : null
  const lineageDepth = Math.max(0, item.lineageDepth ?? 0)
  const lineageChildCount = item.lineageChildCount ?? 0

  return (
    <Pressable
      className="active:bg-accent min-h-11 flex-row items-start gap-1.5 py-1.5 pr-2 pl-2.5"
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
        <View className="relative -my-1.5 w-5 self-stretch">
          <View
            pointerEvents="none"
            className={cn('absolute inset-x-0 top-0 items-center', !endsProjectRail && 'bottom-0')}
            style={endsProjectRail ? { height: PROJECT_RAIL_STATUS_CENTER_TOP_PT } : undefined}
          >
            <View className="bg-border w-hairline h-full" />
          </View>
          <View
            pointerEvents="none"
            className="bg-border h-hairline absolute left-1/2"
            style={{
              top: PROJECT_RAIL_STATUS_CENTER_TOP_PT,
              width: PROJECT_RAIL_BASE_ELBOW_WIDTH_PT + spacing4 * lineageDepth
            }}
          />
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
        <View className="h-5 items-center justify-center">
          <WorkspaceLeadingStatus branch={item.branch} linkedPR={item.linkedPR} status={status} />
        </View>
      </View>

      <View className="min-w-0 flex-1">
        <View className="min-h-5 flex-row items-center gap-1.5">
          {!hideRepo ? <MobileRepoIcon repoIcon={repoIcon} size={16} /> : null}
          <Text
            className={cn(
              'shrink text-base leading-5',
              item.unread ? 'text-foreground' : 'text-foreground/80',
              isReadOnly && 'opacity-50'
            )}
            numberOfLines={1}
          >
            {item.displayName || item.repo}
          </Text>
          <WorkspaceMetaGlyphs
            comment={item.comment}
            linkedPR={item.linkedPR?.number}
            linkedGitLabMR={item.linkedGitLabMR}
          />
        </View>
        {folderMeta ? (
          <View className="min-h-4 flex-row items-center gap-1">
            <Text className="text-muted-foreground shrink text-sm leading-4" numberOfLines={1}>
              {folderMeta}
            </Text>
          </View>
        ) : null}
        {/* Only agents get a secondary activity line, matching desktop. A plain
            terminal's shell-output tail is intentionally not surfaced here. */}
        {item.agents && item.agents.length > 0 ? (
          <WorkspaceAgentList
            agents={item.agents}
            now={now}
            railStartOffsetPt={folderMeta ? spacing4 : 0}
            unvisited={item.unread}
          />
        ) : null}
        {lineageChildCount > 0 && onToggleLineage ? (
          <MobileGlassPressable
            className="rounded-full"
            containerClassName="mt-1 self-start"
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
              {lineageChildCount === 1
                ? translate('mobile.workspace.lineage.childCount', '{{count}} child', {
                    count: lineageChildCount
                  })
                : translate('mobile.workspace.lineage.childrenCount', '{{count}} children', {
                    count: lineageChildCount
                  })}
            </Text>
          </MobileGlassPressable>
        ) : null}
      </View>

      <View className="w-5 items-center">
        {item.unread ? (
          <View className="h-5 items-center justify-center">
            <BellSimple size={16} colorClassName="accent-amber-500" weight="fill" />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
