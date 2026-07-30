import { View } from 'react-native'

import {
  Plus,
  SidebarSimple as Sidebar,
  TerminalWindow,
  UserCircle,
  type Icon
} from '@/components/uniwind-icons'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'
import { MobileGlassTextButton } from '../components/glass/text-button'
import { MobileSearchField } from '../components/search-field'

type MobileWorkspaceListToolbarProps = {
  canUseHost: boolean
  embedded: boolean
  floatingWorkspaceEnabled: boolean
  search: string
  onAccounts: () => void
  onFloatingWorkspace: () => void
  onNewWorkspace: () => void
  onSearchChange: (value: string) => void
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
  showReconnect: boolean
  onAccounts: () => void
}

export function MobileWorkspaceListHeaderActions({
  canUseHost,
  embedded,
  onHideSidebar,
  onReconnect,
  showReconnect,
  onAccounts
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
  canUseHost,
  embedded,
  floatingWorkspaceEnabled,
  search,
  onAccounts,
  onFloatingWorkspace,
  onNewWorkspace,
  onSearchChange
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
      <View className="flex-1">
        <MobileSearchField
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search workspaces…"
          accessibilityLabel="Search workspaces"
        />
      </View>
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
      </MobileGlassGroup>
    </View>
  )
}
