import type { SmartWorkspaceSourceRow as SourceRow } from '@yiru/workbench-model/workspace'
import { cn } from 'cnfast'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native'

import { translate } from '~/i18n/translate'

import { BottomDrawer } from '../components/bottom-drawer'
import { MobileContentSection } from '../components/content-section'
import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'
import { MobileGlassSurface } from '../components/glass/surface'
import { MobileGlassTextButton } from '../components/glass/text-button'
import { MobileSegmentedControl } from '../components/segmented-control'
import type { RpcClient } from '../transport/rpc-client'
import type { MrStateFilter, SmartNameMode } from './composer-source-types'
import { SmartSourceModeIcon } from './smart-source-mode-icon'
import {
  MR_STATE_FILTER_OPTIONS,
  resolveAvailableSmartModes,
  resolveDefaultSmartMode,
  SMART_MODE_OPTIONS,
  type SmartModeAvailabilityInput,
  type SmartModeOption
} from './smart-source-modes'
import { lookupGitHubItemByOwnerRepo, type PasteRepoCandidate } from './smart-source-paste-intent'
import { SmartWorkspaceSourceRow } from './smart-workspace-source-row'
import type { MobileComposerSource } from './use-composer-source'
import { useSmartWorkspaceSource } from './use-smart-workspace-source'

type SmartWorkspaceSourceDrawerProps = {
  visible: boolean
  client: RpcClient | null
  composer: MobileComposerSource
  availability: SmartModeAvailabilityInput
  repoId: string | null
  repos: readonly PasteRepoCandidate[]
  sshReady: boolean
  onRepoChange: (repoId: string) => void
  onClose: () => void
}

export function SmartWorkspaceSourceDrawer({
  visible,
  client,
  composer,
  availability,
  repoId,
  repos,
  sshReady,
  onRepoChange,
  onClose
}: SmartWorkspaceSourceDrawerProps): React.JSX.Element {
  const availableModes = useMemo(() => resolveAvailableSmartModes(availability), [availability])
  const [mode, setMode] = useState<SmartNameMode>(() => resolveDefaultSmartMode(availability))
  const [mrStateFilter, setMrStateFilter] = useState<MrStateFilter>('opened')
  // Why: read latest availability inside the open effect without making it a
  // reactive dep (the object is recreated each render), so re-seeding happens
  // only on open, not on every availability recompute.
  const availabilityRef = useRef(availability)
  availabilityRef.current = availability

  // Reset to the default mode each time the drawer opens.
  useEffect(() => {
    if (visible) {
      setMode(resolveDefaultSmartMode(availabilityRef.current))
    }
  }, [visible])

  // Snap the chosen mode back into the available set if availability changes.
  const effectiveMode = availableModes.includes(mode) ? mode : (availableModes[0] ?? 'text')

  const searchEnabled = visible && sshReady

  const { rows, loading, error, needsGitHubRemote, crossRepoPrompt, dismissCrossRepoPrompt } =
    useSmartWorkspaceSource({
      client,
      enabled: searchEnabled,
      mode: effectiveMode,
      query: composer.name,
      repoId,
      githubAvailable: availability.githubAvailable,
      gitlabAvailable: availability.gitlabAvailable,
      mrStateFilter,
      repos
    })

  function handleSelectRow(row: SourceRow): void {
    switch (row.kind) {
      case 'use-name':
        composer.setName(row.name)
        break
      case 'create-branch':
        composer.handleSmartCreateBranch(row.name)
        break
      case 'github':
        composer.handleSmartGitHubItemSelect(row.item)
        break
      case 'gitlab':
        composer.handleSmartGitLabItemSelect(row.item)
        break
      case 'branch':
        composer.handleSmartBranchSelect(row.refName, row.localBranchName)
        break
    }
    onClose()
  }

  async function handleAcceptCrossRepo(): Promise<void> {
    if (!client || !crossRepoPrompt) {
      return
    }
    const { link, matchingRepo } = crossRepoPrompt
    try {
      const item = await lookupGitHubItemByOwnerRepo(
        client,
        matchingRepo.id,
        link.slug,
        link.number,
        link.type
      )
      if (item) {
        onRepoChange(matchingRepo.id)
        composer.handleSmartGitHubItemSelect(item)
        onClose()
      }
    } catch {
      dismissCrossRepoPrompt()
    }
  }

  const showEmpty =
    !loading && !error && !needsGitHubRemote && effectiveMode !== 'text' && rows.length === 0

  return (
    <BottomDrawer visible={visible} onClose={onClose} contentScrollable={false}>
      <View className="flex-row items-center justify-between px-1 pb-2">
        <Text className="text-foreground text-sm font-semibold">
          {translate('mobile.newWorkspace.source.title', "Name or 'Create From'")}
        </Text>
        <MobileGlassTextButton
          label={translate('mobile.common.done', 'Done')}
          onPress={onClose}
          size="small"
        />
      </View>

      <MobileGlassSurface className="mb-2 min-h-11 overflow-hidden rounded-full" isInteractive>
        <TextInput
          className="text-foreground min-h-11 rounded-full px-4 text-sm"
          value={composer.name}
          onChangeText={composer.setName}
          placeholder={translate(
            'mobile.newWorkspace.source.searchPlaceholder',
            'Type a name or search a source'
          )}
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </MobileGlassSurface>

      <MobileGlassGroup className="mb-2 flex-row flex-wrap gap-2" spacing={8}>
        {SMART_MODE_OPTIONS.filter((option: SmartModeOption) =>
          availableModes.includes(option.id)
        ).map((option) => {
          const selected = option.id === effectiveMode
          return (
            <MobileGlassPressable
              key={option.id}
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              className="rounded-full"
              contentClassName="min-h-11 flex-row items-center gap-1 rounded-full px-3"
              hitSlop={0}
              isSelected={selected}
              onPress={() => setMode(option.id)}
            >
              <SmartSourceModeIcon
                icon={option.icon}
                colorClassName={selected ? 'accent-foreground' : 'accent-muted-foreground'}
              />
              <Text className={cn('text-muted-foreground text-xs', selected && 'text-foreground')}>
                {option.label}
              </Text>
            </MobileGlassPressable>
          )
        })}
      </MobileGlassGroup>

      {effectiveMode === 'gitlab' ? (
        <View className="mb-2">
          <MobileSegmentedControl
            accessibilityLabel={translate(
              'mobile.newWorkspace.source.state.label',
              'Merge request state'
            )}
            onChange={setMrStateFilter}
            options={MR_STATE_FILTER_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label
            }))}
            value={mrStateFilter}
          />
        </View>
      ) : null}

      {crossRepoPrompt ? (
        <MobileContentSection className="mb-2 gap-2 p-3">
          <Text className="text-muted-foreground text-xs">
            {translate(
              'mobile.newWorkspace.source.crossRepo.message',
              'This item lives in {{owner}}/{{repo}}.',
              {
                owner: crossRepoPrompt.link.slug.owner,
                repo: crossRepoPrompt.link.slug.repo
              }
            )}
          </Text>
          <MobileGlassGroup className="flex-row justify-end gap-2" spacing={8}>
            <MobileGlassTextButton
              label={translate('mobile.common.cancel', 'Cancel')}
              onPress={dismissCrossRepoPrompt}
              size="small"
            />
            <MobileGlassTextButton
              isProminent
              label={translate(
                'mobile.newWorkspace.source.crossRepo.switch',
                'Switch to {{repo}}',
                { repo: crossRepoPrompt.matchingRepo.displayName }
              )}
              onPress={() => void handleAcceptCrossRepo()}
              size="small"
            />
          </MobileGlassGroup>
        </MobileContentSection>
      ) : null}

      {!sshReady && effectiveMode !== 'text' ? (
        <Text className="text-muted-foreground px-1 pb-2 text-xs">
          {translate(
            'mobile.newWorkspace.source.connectRepository',
            'Connect the repository to search sources.'
          )}
        </Text>
      ) : needsGitHubRemote ? (
        <Text className="text-muted-foreground px-1 pb-2 text-xs">
          {translate(
            'mobile.newWorkspace.source.githubRemoteRequired',
            'This SSH repo needs a GitHub remote to list pull requests.'
          )}
        </Text>
      ) : error ? (
        <Text className="text-destructive px-1 pb-2 text-xs">{error}</Text>
      ) : null}

      <MobileContentSection className="max-h-96 grow-0">
        <FlatList
          className="max-h-96 grow-0"
          data={rows}
          keyExtractor={(row) => row.value}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          ListFooterComponent={
            loading ? (
              <View className="items-center py-4">
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              </View>
            ) : showEmpty ? (
              <Text className="text-muted-foreground py-4 text-center text-xs">
                {emptyHintForMode(effectiveMode)}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <SmartWorkspaceSourceRow row={item} onPress={() => handleSelectRow(item)} />
          )}
        />
      </MobileContentSection>
    </BottomDrawer>
  )
}

function emptyHintForMode(mode: SmartNameMode): string {
  switch (mode) {
    case 'smart':
      return translate(
        'mobile.newWorkspace.source.empty.smart',
        'Start typing to create a name or find a source.'
      )
    case 'github':
      return translate(
        'mobile.newWorkspace.source.empty.github',
        'Start typing to search GitHub pull requests.'
      )
    case 'gitlab':
      return translate(
        'mobile.newWorkspace.source.empty.gitlab',
        'Start typing to search GitLab merge requests.'
      )
    case 'branches':
      return translate('mobile.newWorkspace.source.empty.branches', 'No matching branches.')
    case 'text':
      return translate('mobile.common.noResults', 'No results found.')
  }
}
