import type { SmartWorkspaceSourceRow as SourceRow } from '@yiru/workbench-model/workspace'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { RpcClient } from '../transport/rpc-client'
import type { MrStateFilter, SmartNameMode } from '../workspace-create/composer-source-types'
import {
  MR_STATE_FILTER_OPTIONS,
  resolveAvailableSmartModes,
  resolveDefaultSmartMode,
  SMART_MODE_OPTIONS,
  type SmartModeAvailabilityInput,
  type SmartModeOption
} from '../workspace-create/smart-source-modes'
import {
  lookupGitHubItemByOwnerRepo,
  type PasteRepoCandidate
} from '../workspace-create/smart-source-paste-intent'
import type { MobileComposerSource } from '../workspace-create/use-composer-source'
import { useSmartWorkspaceSource } from '../workspace-create/use-smart-workspace-source'
import { BottomDrawer, BOTTOM_DRAWER_HIDE_DURATION_MS } from './bottom-drawer'
import { SmartSourceModeIcon } from './smart-source-mode-icon'
import { SmartWorkspaceSourceRow } from './smart-workspace-source-row'

type Props = {
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
}: Props) {
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

  const {
    rows,
    loading,
    error,
    needsGitHubRemote,
    emptyHint,
    crossRepoPrompt,
    dismissCrossRepoPrompt
  } = useSmartWorkspaceSource({
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

  function closeSoon(): void {
    setTimeout(onClose, BOTTOM_DRAWER_HIDE_DURATION_MS)
  }

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
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      dragContentToDismiss={false}
      contentScrollable={false}
    >
      <View className="flex-row items-center justify-between px-1 pb-2">
        <Text className="text-foreground text-sm font-semibold">Name or 'Create From'</Text>
        <Pressable onPress={closeSoon} hitSlop={8}>
          <Text className="text-primary text-sm font-semibold">Done</Text>
        </Pressable>
      </View>

      <TextInput
        className="bg-secondary text-foreground border-border mb-2 border px-3 py-2 text-sm"
        value={composer.name}
        onChangeText={composer.setName}
        placeholder="Type a name or search a source"
        placeholderTextColorClassName="accent-muted-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      <View className="mb-2 flex-row flex-wrap gap-1">
        {SMART_MODE_OPTIONS.filter((option: SmartModeOption) =>
          availableModes.includes(option.id)
        ).map((option) => {
          const selected = option.id === effectiveMode
          return (
            <Pressable
              key={option.id}
              className={cn(
                'flex-row items-center gap-1 px-2.5 py-1.5 border border-border',
                selected && 'bg-card border-muted-foreground'
              )}
              onPress={() => setMode(option.id)}
            >
              <SmartSourceModeIcon
                icon={option.icon}
                colorClassName={selected ? 'accent-foreground' : 'accent-muted-foreground'}
              />
              <Text
                className={cn(
                  'text-xs text-muted-foreground',
                  selected && 'text-foreground font-semibold'
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {effectiveMode === 'gitlab' ? (
        <View className="mb-2 flex-row gap-1">
          {MR_STATE_FILTER_OPTIONS.map((option) => {
            const selected = option.id === mrStateFilter
            return (
              <Pressable
                key={option.id}
                className={cn(
                  'px-3 py-1 border border-border',
                  selected && 'bg-card border-muted-foreground'
                )}
                onPress={() => setMrStateFilter(option.id)}
              >
                <Text
                  className={cn(
                    'text-xs text-muted-foreground',
                    selected && 'text-foreground font-semibold'
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {crossRepoPrompt ? (
        <View className="bg-secondary border-border mb-2 gap-2 border p-3">
          <Text className="text-muted-foreground text-xs">
            This item lives in {crossRepoPrompt.link.slug.owner}/{crossRepoPrompt.link.slug.repo}.
          </Text>
          <View className="flex-row justify-end gap-2">
            <Pressable
              className="border-border border px-3 py-1.5"
              onPress={dismissCrossRepoPrompt}
            >
              <Text className="text-muted-foreground text-xs">Cancel</Text>
            </Pressable>
            <Pressable
              className="bg-card border-muted-foreground border px-3 py-1.5"
              onPress={() => void handleAcceptCrossRepo()}
            >
              <Text className="text-foreground text-xs font-semibold">
                Switch to {crossRepoPrompt.matchingRepo.displayName}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!sshReady && effectiveMode !== 'text' ? (
        <Text className={styles.notice}>Connect the repository to search sources.</Text>
      ) : needsGitHubRemote ? (
        <Text className={styles.notice}>
          This SSH repo needs a GitHub remote to list pull requests.
        </Text>
      ) : error ? (
        <Text className="text-destructive px-1 pb-2 text-xs">{error}</Text>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.value}
        className="bg-card max-h-[420px] grow-0 overflow-hidden"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        ListFooterComponent={
          loading ? (
            <View className="items-center py-4">
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            </View>
          ) : showEmpty ? (
            <Text className="text-muted-foreground/60 py-4 text-center text-xs">
              {emptyHint || 'No results found.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <SmartWorkspaceSourceRow row={item} onPress={() => handleSelectRow(item)} />
        )}
      />
    </BottomDrawer>
  )
}

const styles = {
  notice: cn('text-xs text-muted-foreground/60 px-1 pb-2')
} as const
