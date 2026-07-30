import { Button, Host, HStack, Image, TextField, useNativeState, VStack } from '@expo/ui/swift-ui'
import {
  autocorrectionDisabled,
  buttonBorderShape,
  controlSize,
  frame,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '../components/glass/availability'
import {
  MobileSwiftUiGlassCircleButton,
  MobileSwiftUiGlassGroup,
  MobileSwiftUiGlassInputShell,
  mobileSwiftUiGlassButtonStyle
} from '../components/glass/swift-ui.ios'
import { resolveCssString } from '../style/resolve-css-variable'

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
  canUseHost,
  embedded,
  floatingWorkspaceEnabled,
  search,
  onAccounts,
  onFloatingWorkspace,
  onNewWorkspace,
  onSearchChange
}: MobileWorkspaceListToolbarProps): React.JSX.Element {
  const nativeSearch = useNativeState(search)
  const nativeSearchRef = useRef(search)
  const { theme } = useUniwind()
  const mutedForegroundColor = resolveCssString(useCSSVariable('--color-muted-foreground'))
  const fullWidthModifiers = useMemo<ViewModifier[]>(
    () => [frame({ maxWidth: Infinity, alignment: 'leading' })],
    []
  )
  const searchModifiers = useMemo<ViewModifier[]>(
    () => [
      textFieldStyle('plain'),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' }),
      submitLabel('search'),
      autocorrectionDisabled(),
      textInputAutocapitalization('never')
    ],
    []
  )

  useEffect(() => {
    if (nativeSearchRef.current !== search) {
      nativeSearchRef.current = search
      nativeSearch.set(search)
    }
  }, [nativeSearch, search])

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
      <MobileSwiftUiGlassInputShell hasTrailingAction={false} minHeight={44}>
        <Image systemName="magnifyingglass" size={16} color={mutedForegroundColor} />
        <TextField
          modifiers={searchModifiers}
          onTextChange={(nextValue) => {
            nativeSearchRef.current = nextValue
            onSearchChange(nextValue)
          }}
          placeholder="Search workspaces…"
          text={nativeSearch}
        />
      </MobileSwiftUiGlassInputShell>
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
            </HStack>
          </VStack>
        ) : (
          primaryControls
        )}
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
