import { Pressable, Text, View } from 'react-native'

import {
  Funnel as Filter,
  MagnifyingGlass as Search,
  Plus,
  SlidersHorizontal,
  SidebarSimple as Sidebar,
  TerminalWindow,
  UserCircle,
  X,
  type Icon
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'
import { MobileGlassSurface } from '../components/glass/surface'
import { MobileGlassTextButton } from '../components/glass/text-button'

type MobileWorkspaceListToolbarProps = {
  activeFilterCount: number
  canUseHost: boolean
  embedded: boolean
  floatingWorkspaceEnabled: boolean
  showSearch: boolean
  sortLabel: string
  onAccounts: () => void
  onFilter: () => void
  onFloatingWorkspace: () => void
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
  embedded: boolean
  onHideSidebar?: () => void
  onReconnect: () => void
  showSearch: boolean
  showReconnect: boolean
  onAccounts: () => void
  onSearch: () => void
}

export function MobileWorkspaceListHeaderActions({
  canUseHost,
  embedded,
  onHideSidebar,
  onReconnect,
  showReconnect,
  showSearch,
  onAccounts,
  onSearch
}: MobileWorkspaceListHeaderActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      {showReconnect ? <MobileGlassTextButton label="Reconnect" onPress={onReconnect} /> : null}
      {!embedded && !showReconnect ? (
        <ToolbarIconButton
          accessibilityLabel="Accounts"
          disabled={!canUseHost}
          icon={UserCircle}
          onPress={onAccounts}
        />
      ) : null}
      {!embedded ? (
        <ToolbarIconButton
          accessibilityLabel={showSearch ? 'Close search' : 'Search workspaces'}
          icon={showSearch ? X : Search}
          onPress={onSearch}
        />
      ) : null}
      {embedded && onHideSidebar ? (
        <ToolbarIconButton
          accessibilityLabel="Hide sidebar"
          icon={Sidebar}
          onPress={onHideSidebar}
        />
      ) : null}
    </MobileGlassGroup>
  )
}

export function MobileWorkspaceListToolbar({
  activeFilterCount,
  canUseHost,
  embedded,
  floatingWorkspaceEnabled,
  showSearch,
  sortLabel,
  onAccounts,
  onFilter,
  onFloatingWorkspace,
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
      <MobileGlassSurface className="flex-1 overflow-hidden rounded-full" isFunctional>
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
