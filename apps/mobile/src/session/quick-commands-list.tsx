import type { TuiAgent } from '@yiru/workbench-model/agent'
import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { Check, Pencil, Play, Plus, Trash } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileAgentIcon } from '../components/mobile-agent-icon'
import { MobileSearchField } from '../components/mobile-search-field'
import {
  getQuickCommandDisplayPreview,
  isAgentQuickCommand,
  supportsTerminalAgentQuickCommand
} from '../terminal/quick-commands'
import { MOBILE_AGENT_CATALOG } from '../workspace-create/mobile-agent-catalog'

export const QUICK_COMMAND_SUPPORTED_AGENTS = MOBILE_AGENT_CATALOG.filter((entry) =>
  supportsTerminalAgentQuickCommand(entry.id)
)
export const QUICK_COMMAND_SEARCH_QUERY_MAX_LENGTH = 2048

type ListProps = {
  repoCommands: TerminalQuickCommand[]
  globalCommands: TerminalQuickCommand[]
  totalCount: number
  query: string
  loading: boolean
  disabled: boolean
  canAdd: boolean
  error: string | null
  onQueryChange: (value: string) => void
  onLaunch: (command: TerminalQuickCommand) => void
  onEdit: (command: TerminalQuickCommand) => void
  onDelete: (command: TerminalQuickCommand) => void
  onAdd: () => void
}

export function QuickCommandsList(props: ListProps) {
  const {
    repoCommands,
    globalCommands,
    totalCount,
    query,
    loading,
    disabled,
    canAdd,
    error,
    onQueryChange,
    onLaunch,
    onEdit,
    onDelete,
    onAdd
  } = props
  const hasVisible = repoCommands.length + globalCommands.length > 0
  const showSearch = totalCount > 1 || query.length > 0
  return (
    <View className={styles.listBody}>
      {showSearch ? (
        <MobileSearchField
          value={query.slice(0, QUICK_COMMAND_SEARCH_QUERY_MAX_LENGTH)}
          onChangeText={(value) =>
            onQueryChange(value.slice(0, QUICK_COMMAND_SEARCH_QUERY_MAX_LENGTH))
          }
          placeholder="Search quick commands..."
          editable={!disabled}
        />
      ) : null}
      {error ? <Text className={styles.error}>{error}</Text> : null}
      {loading && !hasVisible ? (
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      ) : null}
      {!loading && totalCount === 0 ? (
        <Text className={styles.empty}>No quick commands yet.</Text>
      ) : null}
      {!loading && totalCount > 0 && !hasVisible ? (
        <Text className={styles.empty}>No matching quick commands.</Text>
      ) : null}
      {repoCommands.length > 0 ? (
        <QuickCommandGroup
          label="This project"
          commands={repoCommands}
          disabled={disabled}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
      {globalCommands.length > 0 ? (
        <QuickCommandGroup
          label="Global"
          commands={globalCommands}
          disabled={disabled}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
      <Pressable
        className={cn(styles.addRow, (disabled || !canAdd) && styles.disabled)}
        disabled={disabled || !canAdd}
        onPress={onAdd}
        accessibilityRole="button"
      >
        <Plus size={18} colorClassName="accent-muted-foreground" />
        <Text className={styles.addText}>
          {canAdd ? 'New quick command' : 'Quick command limit reached'}
        </Text>
      </Pressable>
    </View>
  )
}

function QuickCommandGroup({
  label,
  commands,
  disabled,
  onLaunch,
  onEdit,
  onDelete
}: {
  label: string
  commands: TerminalQuickCommand[]
  disabled: boolean
  onLaunch: (command: TerminalQuickCommand) => void
  onEdit: (command: TerminalQuickCommand) => void
  onDelete: (command: TerminalQuickCommand) => void
}) {
  return (
    <View>
      <Text className={styles.groupLabel}>{label}</Text>
      <View className={styles.group}>
        {commands.map((command, index) => (
          <QuickCommandRow
            key={command.id}
            command={command}
            first={index === 0}
            disabled={disabled}
            onLaunch={onLaunch}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </View>
    </View>
  )
}

function QuickCommandRow({
  command,
  first,
  disabled,
  onLaunch,
  onEdit,
  onDelete
}: {
  command: TerminalQuickCommand
  first: boolean
  disabled: boolean
  onLaunch: (command: TerminalQuickCommand) => void
  onEdit: (command: TerminalQuickCommand) => void
  onDelete: (command: TerminalQuickCommand) => void
}) {
  const isAgent = isAgentQuickCommand(command)
  return (
    <View className={cn(styles.row, !first && styles.rowBorder, disabled && styles.disabled)}>
      <Pressable
        className={styles.rowMain}
        disabled={disabled}
        onPress={() => onLaunch(command)}
        accessibilityRole="button"
        accessibilityLabel={`Run ${command.label}`}
      >
        <View className={styles.rowIcon}>
          {isAgent ? (
            <MobileAgentIcon agentId={command.agent} size={16} />
          ) : (
            <Play size={14} weight="fill" colorClassName="accent-foreground" />
          )}
        </View>
        <View className={styles.rowText}>
          <Text className={styles.rowLabel} numberOfLines={1}>
            {command.label}
          </Text>
          <Text className={cn(styles.rowPreview, !isAgent && styles.mono)} numberOfLines={1}>
            {getQuickCommandDisplayPreview(command)}
          </Text>
        </View>
      </Pressable>
      <Pressable
        className={styles.rowAction}
        disabled={disabled}
        onPress={() => onEdit(command)}
        accessibilityLabel={`Edit ${command.label}`}
      >
        <Pencil size={15} colorClassName="accent-muted-foreground" />
      </Pressable>
      <Pressable
        className={styles.rowAction}
        disabled={disabled}
        onPress={() => onDelete(command)}
        accessibilityLabel={`Delete ${command.label}`}
      >
        <Trash size={15} colorClassName="accent-destructive" />
      </Pressable>
    </View>
  )
}

export function QuickCommandAgentPicker({
  selected,
  onSelect
}: {
  selected: TuiAgent | null
  onSelect: (agent: TuiAgent) => void
}) {
  return (
    <View className={styles.group}>
      {QUICK_COMMAND_SUPPORTED_AGENTS.map((agent, index) => (
        <Pressable
          key={agent.id}
          className={cn(styles.agentRow, index > 0 && styles.rowBorder)}
          onPress={() => onSelect(agent.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === agent.id }}
        >
          <View className={styles.rowIcon}>
            <MobileAgentIcon agentId={agent.id} size={16} />
          </View>
          <Text className={styles.agentLabel}>{agent.label}</Text>
          {selected === agent.id ? <Check size={16} colorClassName="accent-foreground" /> : null}
        </Pressable>
      ))}
    </View>
  )
}

const styles = {
  listBody: cn('gap-2 pb-2'),
  disabled: cn('opacity-[0.45]'),
  error: cn('px-1 text-[13px] text-destructive'),
  empty: cn('py-4 text-center text-[14px] text-muted-foreground'),
  groupLabel: cn(
    'px-1 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground'
  ),
  group: cn('overflow-hidden border border-border bg-card'),
  row: cn('flex-row items-center'),
  rowBorder: cn('border-t border-t-border'),
  rowMain: cn('min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-3 active:bg-accent'),
  rowIcon: cn('h-7 w-7 items-center justify-center bg-muted'),
  rowText: cn('min-w-0 flex-1'),
  rowLabel: cn('text-[14px] font-semibold text-foreground'),
  rowPreview: cn('mt-px text-[12px] text-muted-foreground'),
  mono: cn('font-mono'),
  rowAction: cn('h-11 w-10 items-center justify-center active:bg-accent'),
  agentRow: cn('flex-row items-center gap-3 px-3 py-3 active:bg-accent'),
  agentLabel: cn('flex-1 text-[14px] text-foreground'),
  addRow: cn(
    'mt-1 flex-row items-center gap-2 border border-dashed border-border bg-card px-3 py-3 active:bg-accent'
  ),
  addText: cn('text-[14px] font-semibold text-foreground')
} as const
