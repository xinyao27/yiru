import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'
import { useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'

import { CaretLeft } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from '../components/bottom-drawer'
import {
  getQuickCommandPreview,
  MAX_QUICK_COMMANDS,
  quickCommandMatchesRepo
} from '../terminal/quick-commands'
import type { RpcClient } from '../transport/rpc-client'
import {
  createEmptyQuickCommandDraft,
  draftToQuickCommand,
  quickCommandToDraft,
  type QuickCommandDraft
} from './quick-command-draft'
import { QuickCommandEditorForm } from './quick-command-editor-form'
import { QuickCommandAgentPicker, QuickCommandsList } from './quick-commands-list'
import { useQuickCommands } from './use-quick-commands'

type SheetView = 'list' | 'editor' | 'agent'

export function QuickCommandsSheet({
  visible,
  onClose,
  client,
  repoId,
  repoName,
  onLaunch
}: {
  visible: boolean
  onClose: () => void
  client: RpcClient | null
  repoId: string | null
  repoName: string | null
  onLaunch: (command: TerminalQuickCommand) => boolean
}) {
  const { commands, loading, ready, error, persist } = useQuickCommands({
    client,
    enabled: visible
  })
  const [view, setView] = useState<SheetView>('list')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<QuickCommandDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [wasVisible, setWasVisible] = useState(visible)

  // Why: reset before the opening commit so a prior editor/search state never
  // flashes during the drawer's entrance animation.
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setView('list')
      setQuery('')
      setDraft(null)
    }
  }

  // Why: prompt bodies can total about 240 KB. Build lowercase search text once
  // per settings update instead of reallocating it on every keystroke.
  const searchableCommands = useMemo(
    () =>
      commands
        .filter((command) => quickCommandMatchesRepo(command, repoId))
        .map((command) => ({
          command,
          searchText: `${command.label} ${getQuickCommandPreview(command)}`.toLowerCase()
        })),
    [commands, repoId]
  )
  const visibleCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return searchableCommands
      .filter((entry) => !normalizedQuery || entry.searchText.includes(normalizedQuery))
      .map((entry) => entry.command)
  }, [query, searchableCommands])
  const repoCommands = visibleCommands.filter((command) => command.scope?.type === 'repo')
  const globalCommands = visibleCommands.filter((command) => command.scope?.type !== 'repo')

  function openEditor(command?: TerminalQuickCommand) {
    if (!command && commands.length >= MAX_QUICK_COMMANDS) {
      return
    }
    setDraft(
      command
        ? quickCommandToDraft(command)
        : createEmptyQuickCommandDraft(repoId ? { type: 'repo', repoId } : { type: 'global' })
    )
    setView('editor')
  }

  function handleDelete(command: TerminalQuickCommand) {
    Alert.alert(
      `Delete "${command.label || 'Untitled'}"?`,
      'This quick command will be removed from your saved list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void persist({ type: 'delete', id: command.id })
        }
      ]
    )
  }

  async function handleSave() {
    if (!draft || savingRef.current) {
      return
    }
    const built = draftToQuickCommand(draft)
    if (!built) {
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      if (await persist({ type: 'upsert', command: built })) {
        setView('list')
        setDraft(null)
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const title =
    view === 'editor'
      ? draft?.id
        ? 'Edit Quick Command'
        : 'Add Quick Command'
      : view === 'agent'
        ? 'Choose Agent'
        : 'Quick Commands'

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View className={styles.header}>
        {view === 'list' ? (
          <View className={styles.backSpacer} />
        ) : (
          <Pressable
            className={styles.backButton}
            onPress={() => setView(view === 'agent' ? 'editor' : 'list')}
            accessibilityLabel="Back"
          >
            <CaretLeft size={18} colorClassName="accent-muted-foreground" />
          </Pressable>
        )}
        <Text className={styles.title}>{title}</Text>
        <View className={styles.backSpacer} />
      </View>
      {view === 'editor' && draft ? (
        <Text className={styles.description}>
          Save terminal commands or agent prompts for quick access.
        </Text>
      ) : null}
      {view === 'list' ? (
        <QuickCommandsList
          repoCommands={repoCommands}
          globalCommands={globalCommands}
          totalCount={searchableCommands.length}
          query={query}
          loading={loading}
          disabled={!ready}
          canAdd={commands.length < MAX_QUICK_COMMANDS}
          error={error}
          onQueryChange={setQuery}
          onLaunch={(command) => {
            if (onLaunch(command)) {
              onClose()
            }
          }}
          onEdit={openEditor}
          onDelete={handleDelete}
          onAdd={() => openEditor()}
        />
      ) : null}
      {view === 'editor' && draft ? (
        <QuickCommandEditorForm
          draft={draft}
          mode={draft.id ? 'edit' : 'add'}
          saving={saving || !ready}
          error={error}
          repoId={repoId}
          repoName={repoName}
          onChange={(patch) =>
            setDraft((current) => (current ? { ...current, ...patch } : current))
          }
          onOpenAgentPicker={() => setView('agent')}
          onCancel={() => {
            setView('list')
            setDraft(null)
          }}
          onSave={() => void handleSave()}
        />
      ) : null}
      {view === 'agent' && draft ? (
        <QuickCommandAgentPicker
          selected={draft.agent}
          onSelect={(agent) => {
            setDraft((current) => (current ? { ...current, agent } : current))
            setView('editor')
          }}
        />
      ) : null}
    </BottomDrawer>
  )
}

const styles = {
  header: cn('flex-row items-center pb-2'),
  backButton: cn('h-[30px] w-[30px] items-center justify-center active:bg-accent'),
  backSpacer: cn('w-[30px]'),
  title: cn('flex-1 text-center text-[16px] font-bold text-foreground'),
  description: cn('px-1 pb-2 text-[12px] text-muted-foreground')
} as const
