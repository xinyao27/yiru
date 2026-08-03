import type { TuiAgent } from '@yiru/workbench-model/agent'
import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'
import { cn } from 'cnfast'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { Check, Play, Plus } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { MobileAgentIcon } from '../components/agent-icon'
import { MobileContentSection } from '../components/content-section'
import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassPressable } from '../components/glass/pressable'
import { MobileSearchField } from '../components/search-field'
import {
  getQuickCommandDisplayPreview,
  isAgentQuickCommand,
  supportsTerminalAgentQuickCommand
} from '../terminal/quick-commands'
import { MOBILE_AGENT_CATALOG } from '../workspace-create/agent-catalog'

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
    <View className="gap-2 pb-2">
      {showSearch ? (
        <MobileSearchField
          value={query.slice(0, QUICK_COMMAND_SEARCH_QUERY_MAX_LENGTH)}
          onChangeText={(value) =>
            onQueryChange(value.slice(0, QUICK_COMMAND_SEARCH_QUERY_MAX_LENGTH))
          }
          placeholder={translate(
            'mobile.quickCommand.searchPlaceholder',
            'Search quick commands...'
          )}
          editable={!disabled}
        />
      ) : null}
      {error ? <Text className="text-destructive px-1 text-xs">{error}</Text> : null}
      {loading && !hasVisible ? (
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      ) : null}
      {!loading && totalCount === 0 ? (
        <Text className={styles.empty}>
          {translate('mobile.quickCommand.empty', 'No quick commands yet.')}
        </Text>
      ) : null}
      {!loading && totalCount > 0 && !hasVisible ? (
        <Text className={styles.empty}>
          {translate('mobile.quickCommand.noMatches', 'No matching quick commands.')}
        </Text>
      ) : null}
      {repoCommands.length > 0 ? (
        <QuickCommandGroup
          label={translate('mobile.quickCommand.projectGroup', 'This project')}
          commands={repoCommands}
          disabled={disabled}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
      {globalCommands.length > 0 ? (
        <QuickCommandGroup
          label={translate('mobile.quickCommand.globalGroup', 'Global')}
          commands={globalCommands}
          disabled={disabled}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
      <MobileGlassPressable
        accessibilityRole="button"
        className="rounded-xl"
        containerClassName="mt-1"
        contentClassName="min-h-11 flex-row items-center gap-2 rounded-xl px-3 py-3"
        disabled={disabled || !canAdd}
        onPress={onAdd}
      >
        <Plus size={18} colorClassName="accent-muted-foreground" />
        <Text className="text-foreground text-sm">
          {canAdd
            ? translate('mobile.quickCommand.new', 'New quick command')
            : translate('mobile.quickCommand.limitReached', 'Quick command limit reached')}
        </Text>
      </MobileGlassPressable>
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
      <Text className="text-muted-foreground px-1 pt-1 pb-1 text-xs font-semibold tracking-wider uppercase">
        {label}
      </Text>
      <MobileContentSection>
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
      </MobileContentSection>
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
    <View
      className={cn(
        'flex-row items-center',
        !first && styles.rowBorder,
        disabled && styles.disabled
      )}
    >
      <Pressable
        className="active:bg-accent min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-3"
        disabled={disabled}
        onPress={() => onLaunch(command)}
        accessibilityRole="button"
        accessibilityLabel={translate(
          'mobile.quickCommand.runAccessibilityLabel',
          'Run {{label}}',
          {
            label: command.label
          }
        )}
      >
        <View className={styles.rowIcon}>
          {isAgent ? (
            <MobileAgentIcon agentId={command.agent} size={16} />
          ) : (
            <Play size={14} colorClassName="accent-foreground" />
          )}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
            {command.label}
          </Text>
          <Text
            className={cn('mt-1 text-xs text-muted-foreground', !isAgent && 'font-mono')}
            numberOfLines={1}
          >
            {getQuickCommandDisplayPreview(command)}
          </Text>
        </View>
      </Pressable>
      <MobileGlassGroup className="mr-2 flex-row gap-2" spacing={8}>
        <MobileGlassIconButton
          accessibilityLabel={translate(
            'mobile.quickCommand.editAccessibilityLabel',
            'Edit {{label}}',
            { label: command.label }
          )}
          disabled={disabled}
          icon="edit"
          onPress={() => onEdit(command)}
          size="small"
        />
        <MobileGlassIconButton
          accessibilityLabel={translate(
            'mobile.quickCommand.deleteAccessibilityLabel',
            'Delete {{label}}',
            { label: command.label }
          )}
          disabled={disabled}
          icon="delete"
          isDestructive
          onPress={() => onDelete(command)}
          size="small"
        />
      </MobileGlassGroup>
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
    <MobileContentSection>
      {QUICK_COMMAND_SUPPORTED_AGENTS.map((agent, index) => (
        <Pressable
          key={agent.id}
          className={cn(
            'flex-row items-center gap-3 px-3 py-3 active:bg-accent',
            index > 0 && styles.rowBorder
          )}
          onPress={() => onSelect(agent.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === agent.id }}
        >
          <View className={styles.rowIcon}>
            <MobileAgentIcon agentId={agent.id} size={16} />
          </View>
          <Text className="text-foreground flex-1 text-sm">{agent.label}</Text>
          {selected === agent.id ? <Check size={16} colorClassName="accent-foreground" /> : null}
        </Pressable>
      ))}
    </MobileContentSection>
  )
}

const styles = {
  disabled: cn('opacity-50'),
  empty: cn('py-4 text-center text-sm text-muted-foreground'),
  rowBorder: cn('border-t border-t-border'),
  rowIcon: cn('h-7 w-7 items-center justify-center bg-muted')
} as const
