import { MenuView, type MenuAction } from '@expo/ui/community/menu'
import { useMemo } from 'react'
import { View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSurface } from '~/components/glass/surface'
import { DotsThree } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

type MobileWorkspaceListHeaderActionsProps = {
  canUseHost: boolean
  floatingWorkspaceEnabled: boolean
  onAccounts: () => void
  onFloatingWorkspace: () => void
  onNewWorkspace: () => void
  onOpenSearch: () => void
  onReconnect: () => void
  onHideSidebar?: () => void
  showReconnect: boolean
}

type WorkspaceListActionId =
  | 'accounts'
  | 'floating-workspace'
  | 'new-workspace'
  | 'reconnect'
  | 'hide-sidebar'

type WorkspaceListMenuState = {
  canUseHost: boolean
  floatingWorkspaceEnabled: boolean
  showHideSidebar: boolean
  showReconnect: boolean
}

function buildWorkspaceListMenuActions({
  canUseHost,
  floatingWorkspaceEnabled,
  showHideSidebar,
  showReconnect
}: WorkspaceListMenuState): MenuAction[] {
  return [
    {
      id: 'new-workspace',
      image: 'plus',
      title: translate('mobile.workspace.actions.newWorkspace', 'New workspace'),
      attributes: { disabled: !canUseHost }
    },
    {
      id: 'floating-workspace',
      image: 'terminal',
      title: translate('mobile.workspace.actions.floatingWorkspace', 'Floating Workspace'),
      attributes: { disabled: !canUseHost, hidden: !floatingWorkspaceEnabled }
    },
    {
      id: 'accounts',
      image: 'person.crop.circle',
      title: translate('mobile.workspace.actions.accounts', 'Accounts'),
      attributes: { disabled: !canUseHost }
    },
    {
      id: 'reconnect',
      image: 'arrow.clockwise',
      title: translate('mobile.workspace.actions.reconnect', 'Reconnect'),
      attributes: { hidden: !showReconnect }
    },
    {
      id: 'hide-sidebar',
      image: 'sidebar.left',
      title: translate('mobile.workspace.actions.hideSidebar', 'Hide sidebar'),
      attributes: { hidden: !showHideSidebar }
    }
  ]
}

function isWorkspaceListActionId(value: string): value is WorkspaceListActionId {
  return (
    value === 'accounts' ||
    value === 'floating-workspace' ||
    value === 'new-workspace' ||
    value === 'reconnect' ||
    value === 'hide-sidebar'
  )
}

function WorkspaceMoreTrigger(): React.JSX.Element {
  return (
    <View className="h-11 w-11 items-center justify-center">
      <MobileGlassSurface
        className="h-9 w-9 overflow-hidden rounded-full"
        isFunctional
        isInteractive
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={translate('mobile.workspace.actions.more', 'More actions')}
          className="h-full w-full items-center justify-center"
        >
          <DotsThree size={18} colorClassName="accent-muted-foreground" />
        </View>
      </MobileGlassSurface>
    </View>
  )
}

export function MobileWorkspaceListHeaderActions({
  canUseHost,
  floatingWorkspaceEnabled,
  onAccounts,
  onFloatingWorkspace,
  onNewWorkspace,
  onOpenSearch,
  onReconnect,
  onHideSidebar,
  showReconnect
}: MobileWorkspaceListHeaderActionsProps): React.JSX.Element {
  const actions = useMemo(
    () =>
      buildWorkspaceListMenuActions({
        canUseHost,
        floatingWorkspaceEnabled,
        showHideSidebar: onHideSidebar !== undefined,
        showReconnect
      }),
    [canUseHost, floatingWorkspaceEnabled, onHideSidebar, showReconnect]
  )

  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      <MobileGlassIconButton
        accessibilityLabel={translate('mobile.workspace.actions.search', 'Search workspaces')}
        icon="search"
        onPress={onOpenSearch}
        size="regular"
      />
      <MenuView
        actions={actions}
        title={translate('mobile.workspace.actions.menuTitle', 'Workspace actions')}
        onPressAction={(event) => {
          const actionId = event.nativeEvent.event
          if (!isWorkspaceListActionId(actionId)) {
            return
          }
          switch (actionId) {
            case 'accounts':
              onAccounts()
              break
            case 'floating-workspace':
              onFloatingWorkspace()
              break
            case 'new-workspace':
              onNewWorkspace()
              break
            case 'reconnect':
              onReconnect()
              break
            case 'hide-sidebar':
              onHideSidebar?.()
              break
          }
        }}
      >
        <WorkspaceMoreTrigger />
      </MenuView>
    </MobileGlassGroup>
  )
}
