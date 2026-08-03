import { Link, Redirect, Stack, useRouter } from 'expo-router'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'

import { MobileContentSection } from '../components/content-section'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { CaretRight as ChevronRight } from '../components/uniwind-icons'
import { translate } from '../i18n/translate'
import { updateSessionViewOverride } from '../storage/session-view-preferences'
import {
  mobileUiLabHostId,
  UI_LAB_SCENARIOS,
  UI_LAB_TERMINAL_TAB_ID,
  UI_LAB_WORKTREE_ID,
  type MobileUiLabScenario
} from './fixtures'
import { MobileUiLabGlassCatalog } from './glass-catalog'

const UI_LAB_NAME = translate('mobile.uiLab.title', 'UI Lab')

const UI_LAB_SYSTEM_SCREENS = [
  {
    title: translate('mobile.uiLab.system.settings.title', 'Settings'),
    description: translate(
      'mobile.uiLab.system.settings.description',
      'The production settings index.'
    ),
    href: '/settings'
  },
  {
    title: translate('mobile.uiLab.system.appearance.title', 'Appearance'),
    description: translate(
      'mobile.uiLab.system.appearance.description',
      'Theme and loader preferences.'
    ),
    href: '/appearance-settings'
  },
  {
    title: translate('mobile.uiLab.system.chat.title', 'Chat UI'),
    description: translate(
      'mobile.uiLab.system.chat.description',
      'Native chat display preferences.'
    ),
    href: '/native-chat-settings'
  },
  {
    title: translate('mobile.uiLab.system.terminal.title', 'Terminal'),
    description: translate(
      'mobile.uiLab.system.terminal.description',
      'Terminal scale, input, and shortcut settings.'
    ),
    href: '/terminal-settings'
  },
  {
    title: translate('mobile.uiLab.system.browser.title', 'Browser'),
    description: translate(
      'mobile.uiLab.system.browser.description',
      'Browser interaction preferences.'
    ),
    href: '/browser-settings'
  },
  {
    title: translate('mobile.uiLab.system.notifications.title', 'Notifications'),
    description: translate(
      'mobile.uiLab.system.notifications.description',
      'Push notification controls.'
    ),
    href: '/notifications'
  },
  {
    title: translate('mobile.uiLab.system.troubleshoot.title', 'Troubleshooting'),
    description: translate(
      'mobile.uiLab.system.troubleshoot.description',
      'Diagnostics and connection tools.'
    ),
    href: '/troubleshoot'
  },
  {
    title: translate('mobile.uiLab.system.about.title', 'About'),
    description: translate(
      'mobile.uiLab.system.about.description',
      'Version and product information.'
    ),
    href: '/about'
  }
] as const

type MobileUiLabWorkspaceSurface = 'workspace' | 'source-control' | 'files' | 'history' | 'review'

const UI_LAB_WORKSPACE_SCREENS = [
  {
    id: 'workspace',
    title: translate('mobile.uiLab.workspace.list.title', 'Workspace list'),
    description: translate(
      'mobile.uiLab.workspace.list.description',
      'The real host workspace route with activity, filters, and Glass chrome.'
    )
  },
  {
    id: 'source-control',
    title: translate('mobile.uiLab.workspace.sourceControl.title', 'Source Control'),
    description: translate(
      'mobile.uiLab.workspace.sourceControl.description',
      'Staged, unstaged, untracked, and committed changes with the real commit bar.'
    )
  },
  {
    id: 'files',
    title: translate('mobile.uiLab.workspace.files.title', 'Files'),
    description: translate(
      'mobile.uiLab.workspace.files.description',
      'The production file tree; file rows open the real preview route.'
    )
  },
  {
    id: 'history',
    title: translate('mobile.uiLab.workspace.history.title', 'Agent History'),
    description: translate(
      'mobile.uiLab.workspace.history.description',
      'A production history list with an expandable mocked Codex session.'
    )
  },
  {
    id: 'review',
    title: translate('mobile.uiLab.workspace.review.title', 'Diff Review'),
    description: translate(
      'mobile.uiLab.workspace.review.description',
      'The production review queue, diff viewer, filters, and floating controls.'
    )
  }
] as const satisfies readonly {
  id: MobileUiLabWorkspaceSurface
  title: string
  description: string
}[]

export function MobileUiLabScreen(): React.JSX.Element {
  const router = useRouter()

  if (!__DEV__) {
    return <Redirect href="/" />
  }

  const leave = (): void => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/')
  }

  const openScenario = async (scenario: MobileUiLabScenario): Promise<void> => {
    const hostId = mobileUiLabHostId(scenario.id)
    if (scenario.surface === 'chat' || scenario.surface === 'terminal') {
      await updateSessionViewOverride(
        hostId,
        UI_LAB_WORKTREE_ID,
        UI_LAB_TERMINAL_TAB_ID,
        scenario.surface
      )
    }
    router.push(
      `/h/${hostId}/session/${UI_LAB_WORKTREE_ID}?name=${encodeURIComponent(UI_LAB_NAME)}`
    )
  }

  const openWorkspaceSurface = (surface: MobileUiLabWorkspaceSurface): void => {
    const hostId = mobileUiLabHostId('chat')
    const params = { hostId, worktreeId: UI_LAB_WORKTREE_ID, name: UI_LAB_NAME }
    switch (surface) {
      case 'workspace':
        router.push({ pathname: '/h/[hostId]', params: { hostId, uiLabName: UI_LAB_NAME } })
        break
      case 'source-control':
        router.push({ pathname: '/h/[hostId]/source-control/[worktreeId]', params })
        break
      case 'files':
        router.push({ pathname: '/h/[hostId]/files/[worktreeId]', params })
        break
      case 'history':
        router.push({ pathname: '/h/[hostId]/agent-history/[worktreeId]', params })
        break
      case 'review':
        router.push({ pathname: '/h/[hostId]/review/[worktreeId]', params })
        break
    }
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          title: UI_LAB_NAME,
          headerLeft:
            Platform.OS === 'android'
              ? () => (
                  <MobileGlassIconButton
                    accessibilityLabel={translate('mobile.uiLab.close', 'Close UI Lab')}
                    icon="close"
                    onPress={leave}
                  />
                )
              : undefined
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="xmark" onPress={leave} />
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-safe-offset-6"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-foreground text-sm font-semibold">
          {translate('mobile.uiLab.sessionSurfaces.title', 'Session surfaces')}
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs leading-5">
          {translate(
            'mobile.uiLab.sessionSurfaces.description',
            'Exercise the production session shell with deterministic terminal, chat, file, and browser states.'
          )}
        </Text>
        <MobileContentSection className="mt-3">
          {UI_LAB_SCENARIOS.map((scenario, index) => (
            <Pressable
              key={scenario.id}
              accessibilityRole="button"
              className="active:bg-accent min-h-16 flex-row items-center gap-3 px-3 py-3"
              onPress={() => void openScenario(scenario)}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-sm font-medium">{scenario.title}</Text>
                <Text className="text-muted-foreground mt-1 text-xs leading-4">
                  {scenario.description}
                </Text>
              </View>
              <View className="w-5 items-center">
                <ChevronRight size={16} colorClassName="accent-muted-foreground" />
              </View>
              {index < UI_LAB_SCENARIOS.length - 1 ? (
                <View className="h-hairline bg-border absolute right-3 bottom-0 left-3" />
              ) : null}
            </Pressable>
          ))}
        </MobileContentSection>

        <Text className="text-foreground mt-5 text-sm font-semibold">
          {translate('mobile.uiLab.workspaceSurfaces.title', 'Workspace surfaces')}
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs leading-5">
          {translate(
            'mobile.uiLab.workspaceSurfaces.description',
            'Inspect production data-heavy routes without pairing a desktop.'
          )}
        </Text>
        <MobileContentSection className="mt-3">
          {UI_LAB_WORKSPACE_SCREENS.map((screen, index) => (
            <Pressable
              key={screen.id}
              accessibilityRole="button"
              className="active:bg-accent min-h-16 flex-row items-center gap-3 px-3 py-3"
              onPress={() => openWorkspaceSurface(screen.id)}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-sm font-medium">{screen.title}</Text>
                <Text className="text-muted-foreground mt-1 text-xs leading-4">
                  {screen.description}
                </Text>
              </View>
              <View className="w-5 items-center">
                <ChevronRight size={16} colorClassName="accent-muted-foreground" />
              </View>
              {index < UI_LAB_WORKSPACE_SCREENS.length - 1 ? (
                <View className="h-hairline bg-border absolute right-3 bottom-0 left-3" />
              ) : null}
            </Pressable>
          ))}
        </MobileContentSection>

        <Text className="text-foreground mt-5 text-sm font-semibold">
          {translate('mobile.uiLab.systemScreens.title', 'System screens')}
        </Text>
        <MobileContentSection className="mt-3">
          {UI_LAB_SYSTEM_SCREENS.map((screen, index) => (
            <Link key={screen.href} href={screen.href} asChild>
              <Pressable className="active:bg-accent min-h-16 flex-row items-center gap-3 px-3 py-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-foreground text-sm font-medium">{screen.title}</Text>
                  <Text className="text-muted-foreground mt-1 text-xs leading-4">
                    {screen.description}
                  </Text>
                </View>
                <View className="w-5 items-center">
                  <ChevronRight size={16} colorClassName="accent-muted-foreground" />
                </View>
                {index < UI_LAB_SYSTEM_SCREENS.length - 1 ? (
                  <View className="h-hairline bg-border absolute right-3 bottom-0 left-3" />
                ) : null}
              </Pressable>
            </Link>
          ))}
        </MobileContentSection>

        <MobileUiLabGlassCatalog />
      </ScrollView>
    </View>
  )
}
