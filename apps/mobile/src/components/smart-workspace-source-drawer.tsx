import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { SmartWorkspaceSourceRow as SourceRow } from '../../../desktop/src/shared/new-workspace/smart-workspace-source-results'
import type { RpcClient } from '../transport/rpc-client'
import type { MrStateFilter, SmartNameMode } from '../workspace-create/mobile-composer-source-types'
import {
  MR_STATE_FILTER_OPTIONS,
  resolveAvailableSmartModes,
  resolveDefaultSmartMode,
  SMART_MODE_OPTIONS,
  type SmartModeAvailabilityInput,
  type SmartModeOption
} from '../workspace-create/mobile-smart-source-modes'
import {
  lookupGitHubItemByOwnerRepo,
  type PasteRepoCandidate
} from '../workspace-create/smart-source-paste-intent'
import type { MobileComposerSource } from '../workspace-create/use-mobile-composer-source'
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
      <View className={styles.header}>
        <Text className={styles.title}>Name or 'Create From'</Text>
        <Pressable onPress={closeSoon} hitSlop={8}>
          <Text className={styles.done}>Done</Text>
        </Pressable>
      </View>

      <TextInput
        className={styles.search}
        value={composer.name}
        onChangeText={composer.setName}
        placeholder="Type a name or search a source"
        placeholderTextColorClassName="accent-muted-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      <View className={styles.tabRow}>
        {SMART_MODE_OPTIONS.filter((option: SmartModeOption) =>
          availableModes.includes(option.id)
        ).map((option) => {
          const selected = option.id === effectiveMode
          return (
            <Pressable
              key={option.id}
              className={cn(styles.tab, selected && styles.tabSelected)}
              onPress={() => setMode(option.id)}
            >
              <SmartSourceModeIcon
                icon={option.icon}
                colorClassName={selected ? 'accent-foreground' : 'accent-muted-foreground'}
              />
              <Text className={cn(styles.tabText, selected && styles.tabTextSelected)}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {effectiveMode === 'gitlab' ? (
        <View className={styles.chipRow}>
          {MR_STATE_FILTER_OPTIONS.map((option) => {
            const selected = option.id === mrStateFilter
            return (
              <Pressable
                key={option.id}
                className={cn(styles.chip, selected && styles.chipSelected)}
                onPress={() => setMrStateFilter(option.id)}
              >
                <Text className={cn(styles.chipText, selected && styles.chipTextSelected)}>
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {crossRepoPrompt ? (
        <View className={styles.crossRepo}>
          <Text className={styles.crossRepoText}>
            This item lives in {crossRepoPrompt.link.slug.owner}/{crossRepoPrompt.link.slug.repo}.
          </Text>
          <View className={styles.crossRepoActions}>
            <Pressable className={styles.crossRepoDismiss} onPress={dismissCrossRepoPrompt}>
              <Text className={styles.crossRepoDismissText}>Cancel</Text>
            </Pressable>
            <Pressable
              className={styles.crossRepoSwitch}
              onPress={() => void handleAcceptCrossRepo()}
            >
              <Text className={styles.crossRepoSwitchText}>
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
        <Text className={styles.errorNotice}>{error}</Text>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.value}
        className={styles.list}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        ListFooterComponent={
          loading ? (
            <View className={styles.loading}>
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            </View>
          ) : showEmpty ? (
            <Text className={styles.empty}>{emptyHint || 'No results found.'}</Text>
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
  header: cn('flex-row items-center justify-between px-1 pb-2'),
  title: cn('text-[15px] font-semibold text-foreground'),
  done: cn('text-[14px] font-semibold text-primary'),
  search: cn(
    'bg-secondary text-foreground rounded-none px-3 py-2 text-[14px] border border-border mb-2'
  ),
  tabRow: cn('flex-row flex-wrap gap-1 mb-2'),
  tab: cn('flex-row items-center gap-1 px-2.5 py-1.5 rounded-none border border-border'),
  tabSelected: cn('bg-card border-muted-foreground'),
  tabText: cn('text-[13px] text-muted-foreground'),
  tabTextSelected: cn('text-foreground font-semibold'),
  chipRow: cn('flex-row gap-1 mb-2'),
  chip: cn('px-3 py-1 rounded-none border border-border'),
  chipSelected: cn('bg-card border-muted-foreground'),
  chipText: cn('text-[12px] text-muted-foreground'),
  chipTextSelected: cn('text-foreground font-semibold'),
  crossRepo: cn('bg-secondary rounded-none border border-border p-3 mb-2 gap-2'),
  crossRepoText: cn('text-[13px] text-muted-foreground'),
  crossRepoActions: cn('flex-row justify-end gap-2'),
  crossRepoDismiss: cn('px-3 py-1.5 rounded-none border border-border'),
  crossRepoDismissText: cn('text-[13px] text-muted-foreground'),
  crossRepoSwitch: cn('px-3 py-1.5 rounded-none bg-card border border-muted-foreground'),
  crossRepoSwitchText: cn('text-[13px] font-semibold text-foreground'),
  notice: cn('text-[12px] text-muted-foreground/60 px-1 pb-2'),
  errorNotice: cn('text-[12px] text-destructive px-1 pb-2'),
  list: cn('bg-card rounded-none overflow-hidden max-h-[420px] grow-0'),
  loading: cn('py-4 items-center'),
  empty: cn('py-4 text-center text-muted-foreground/60 text-[13px]')
} as const
