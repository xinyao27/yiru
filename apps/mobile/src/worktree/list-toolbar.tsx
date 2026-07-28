import { Pressable, Text, View } from 'react-native'

import {
  Funnel as Filter,
  MagnifyingGlass as Search,
  Plus,
  SlidersHorizontal,
  Stack as Layers,
  TerminalWindow,
  UserCircle,
  X,
  type Icon
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'
import { MobileGlassSurface } from '../components/glass/surface'

type MobileWorkspaceListToolbarProps = {
  activeFilterCount: number
  canUseHost: boolean
  embedded: boolean
  floatingWorkspaceEnabled: boolean
  groupLabel: string
  showSearch: boolean
  sortLabel: string
  onAccounts: () => void
  onFilter: () => void
  onFloatingWorkspace: () => void
  onGroup: () => void
  onNewWorkspace: () => void
  onSearch: () => void
  onSort: () => void
}

type ToolbarButtonProps = {
  accessibilityLabel: string
  active?: boolean
  disabled?: boolean
  icon: Icon
  label: string
  onPress: () => void
}

function ToolbarButton({
  accessibilityLabel,
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onPress
}: ToolbarButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={cn(
        'min-h-9 flex-1 flex-row items-center justify-center gap-2 px-2',
        active && 'bg-accent',
        disabled && 'opacity-40'
      )}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
    >
      <Icon size={18} colorClassName="accent-muted-foreground" />
      <Text className="text-muted-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

type ToolbarIconButtonProps = {
  accessibilityLabel: string
  disabled?: boolean
  icon: Icon
  onPress: () => void
}

function ToolbarIconButton({
  accessibilityLabel,
  disabled = false,
  icon: Icon,
  onPress
}: ToolbarIconButtonProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-9 w-9 rounded-full"
      contentClassName="h-full w-full items-center justify-center rounded-full"
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
    >
      <Icon size={18} colorClassName="accent-muted-foreground" />
    </MobileGlassPressable>
  )
}

type MobileWorkspaceListHeaderActionsProps = {
  canUseHost: boolean
  showSearch: boolean
  onAccounts: () => void
  onSearch: () => void
}

export function MobileWorkspaceListHeaderActions({
  canUseHost,
  showSearch,
  onAccounts,
  onSearch
}: MobileWorkspaceListHeaderActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      <ToolbarIconButton
        accessibilityLabel="Accounts"
        disabled={!canUseHost}
        icon={UserCircle}
        onPress={onAccounts}
      />
      <ToolbarIconButton
        accessibilityLabel={showSearch ? 'Close search' : 'Search workspaces'}
        icon={showSearch ? X : Search}
        onPress={onSearch}
      />
    </MobileGlassGroup>
  )
}

export function MobileWorkspaceListToolbar({
  activeFilterCount,
  canUseHost,
  embedded,
  floatingWorkspaceEnabled,
  groupLabel,
  showSearch,
  sortLabel,
  onAccounts,
  onFilter,
  onFloatingWorkspace,
  onGroup,
  onNewWorkspace,
  onSearch,
  onSort
}: MobileWorkspaceListToolbarProps): React.JSX.Element {
  const primaryControls = (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      {embedded && floatingWorkspaceEnabled ? (
        <ToolbarIconButton
          accessibilityLabel="Floating Workspace"
          disabled={!canUseHost}
          icon={TerminalWindow}
          onPress={onFloatingWorkspace}
        />
      ) : null}
      <MobileGlassSurface className="flex-1 overflow-hidden rounded-full">
        <View className="flex-row items-center">
          <ToolbarButton
            accessibilityLabel={`Filter workspaces${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
            active={activeFilterCount > 0}
            icon={Filter}
            label={`Filter${activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}`}
            onPress={onFilter}
          />
          <View className="bg-border w-hairline h-5" />
          <ToolbarButton
            accessibilityLabel={`Sort by ${sortLabel}`}
            icon={SlidersHorizontal}
            label={sortLabel}
            onPress={onSort}
          />
          <View className="bg-border w-hairline h-5" />
          <ToolbarButton
            accessibilityLabel={`Group by ${groupLabel}`}
            icon={Layers}
            label={groupLabel}
            onPress={onGroup}
          />
        </View>
      </MobileGlassSurface>
      {!embedded && floatingWorkspaceEnabled ? (
        <ToolbarIconButton
          accessibilityLabel="Floating Workspace"
          disabled={!canUseHost}
          icon={TerminalWindow}
          onPress={onFloatingWorkspace}
        />
      ) : null}
    </MobileGlassGroup>
  )

  if (!embedded) {
    return primaryControls
  }

  return (
    <View className="gap-2">
      {primaryControls}
      <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
        <ToolbarIconButton
          accessibilityLabel="Accounts"
          disabled={!canUseHost}
          icon={UserCircle}
          onPress={onAccounts}
        />
        <ToolbarIconButton
          accessibilityLabel="New workspace"
          disabled={!canUseHost}
          icon={Plus}
          onPress={onNewWorkspace}
        />
        <ToolbarIconButton
          accessibilityLabel={showSearch ? 'Close search' : 'Search workspaces'}
          icon={showSearch ? X : Search}
          onPress={onSearch}
        />
      </MobileGlassGroup>
    </View>
  )
}
