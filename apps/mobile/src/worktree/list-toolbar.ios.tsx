import { Button, ControlGroup, Host, HStack, VStack } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '../components/glass/availability'
import {
  MobileSwiftUiGlassGroup,
  MobileSwiftUiGlassCircleButton,
  mobileSwiftUiGlassButtonStyle
} from '../components/glass/swift-ui.ios'

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
  const isGlassAvailable = useMobileGlassAvailable()
  const { theme } = useUniwind()
  const reconnectModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule')
    ],
    [isGlassAvailable]
  )

  return (
    <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
      <MobileSwiftUiGlassGroup spacing={8}>
        <HStack spacing={8}>
          {showReconnect ? (
            <Button label="Reconnect" modifiers={reconnectModifiers} onPress={onReconnect} />
          ) : null}
          {!embedded && !showReconnect ? (
            <MobileSwiftUiGlassCircleButton
              disabled={!canUseHost}
              label="Accounts"
              size="regular"
              systemImage="person.crop.circle"
              onPress={onAccounts}
            />
          ) : null}
          {!embedded ? (
            <MobileSwiftUiGlassCircleButton
              label={showSearch ? 'Close search' : 'Search workspaces'}
              size="regular"
              systemImage={showSearch ? 'xmark' : 'magnifyingglass'}
              onPress={onSearch}
            />
          ) : null}
          {embedded && onHideSidebar ? (
            <MobileSwiftUiGlassCircleButton
              label="Hide sidebar"
              size="regular"
              systemImage="sidebar.left"
              onPress={onHideSidebar}
            />
          ) : null}
        </HStack>
      </MobileSwiftUiGlassGroup>
    </Host>
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
  const { theme } = useUniwind()
  const fullWidthModifiers = useMemo<ViewModifier[]>(
    () => [frame({ maxWidth: Infinity, alignment: 'leading' })],
    []
  )
  const controlGroupModifiers = useMemo<ViewModifier[]>(
    () => [controlSize('regular'), disabledModifier(!canUseHost)],
    [canUseHost]
  )

  const primaryControls = (
    <HStack spacing={8} modifiers={fullWidthModifiers}>
      {embedded && floatingWorkspaceEnabled ? (
        <MobileSwiftUiGlassCircleButton
          disabled={!canUseHost}
          label="Floating Workspace"
          size="regular"
          systemImage="terminal"
          onPress={onFloatingWorkspace}
        />
      ) : null}
      <ControlGroup modifiers={controlGroupModifiers}>
        <Button
          label={`Filter${activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}`}
          systemImage={
            activeFilterCount > 0
              ? 'line.3.horizontal.decrease.circle.fill'
              : 'line.3.horizontal.decrease'
          }
          onPress={onFilter}
        />
        <Button label={sortLabel} systemImage="arrow.up.arrow.down" onPress={onSort} />
        <Button label={groupLabel} systemImage="square.stack.3d.up" onPress={onGroup} />
      </ControlGroup>
      {!embedded && floatingWorkspaceEnabled ? (
        <MobileSwiftUiGlassCircleButton
          disabled={!canUseHost}
          label="Floating Workspace"
          size="regular"
          systemImage="terminal"
          onPress={onFloatingWorkspace}
        />
      ) : null}
    </HStack>
  )

  return (
    <Host
      colorScheme={theme}
      matchContents={{ vertical: true }}
      style={{ width: '100%', backgroundColor: 'transparent' }}
    >
      <MobileSwiftUiGlassGroup modifiers={fullWidthModifiers} spacing={8}>
        {embedded ? (
          <VStack alignment="leading" spacing={8} modifiers={fullWidthModifiers}>
            {primaryControls}
            <HStack spacing={8} modifiers={fullWidthModifiers}>
              <MobileSwiftUiGlassCircleButton
                disabled={!canUseHost}
                label="Accounts"
                size="regular"
                systemImage="person.crop.circle"
                onPress={onAccounts}
              />
              <MobileSwiftUiGlassCircleButton
                disabled={!canUseHost}
                label="New workspace"
                size="regular"
                systemImage="plus"
                onPress={onNewWorkspace}
              />
              <MobileSwiftUiGlassCircleButton
                label={showSearch ? 'Close search' : 'Search workspaces'}
                size="regular"
                systemImage={showSearch ? 'xmark' : 'magnifyingglass'}
                onPress={onSearch}
              />
            </HStack>
          </VStack>
        ) : (
          primaryControls
        )}
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
