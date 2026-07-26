import { useState } from 'react'
import { Pressable, Switch, Text, TextInput, View } from 'react-native'

import { CaretDown, CaretRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileAgentIcon } from '../components/agent-icon'
import {
  getQuickCommandAgentLabel,
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH
} from '../terminal/quick-commands'
import { isQuickCommandDraftValid, type QuickCommandDraft } from './quick-command-draft'

type Props = {
  draft: QuickCommandDraft
  mode: 'add' | 'edit'
  saving: boolean
  error: string | null
  repoId: string | null
  repoName: string | null
  onChange: (patch: Partial<QuickCommandDraft>) => void
  onOpenAgentPicker: () => void
  onCancel: () => void
  onSave: () => void
}

function ChoiceToggle({
  options,
  value,
  onChange
}: {
  options: readonly { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Pressable
            key={option.value}
            className={cn(
              'h-10 flex-1 items-center justify-center border border-border bg-card',
              selected && 'border-muted-foreground bg-accent',
              option.disabled && styles.disabled
            )}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: option.disabled }}
          >
            <Text
              className={cn(
                'text-xs font-medium text-muted-foreground',
                selected && 'text-foreground'
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function QuickCommandEditorForm({
  draft,
  mode,
  saving,
  error,
  repoId,
  repoName,
  onChange,
  onOpenAgentPicker,
  onCancel,
  onSave
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(draft.scope.type === 'repo')
  const isAgent = draft.action === 'agent-prompt'
  const canSave = isQuickCommandDraftValid(draft) && !saving
  return (
    <View className="gap-3 pt-1 pb-2">
      <View className={styles.field}>
        <Text className={styles.label}>Label</Text>
        <TextInput
          className={styles.input}
          value={draft.label}
          onChangeText={(label) => onChange({ label })}
          placeholder="Start dev server"
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={MAX_QUICK_COMMAND_LABEL_LENGTH}
          selectionColorClassName="accent-primary"
        />
      </View>
      <View className={styles.field}>
        <Text className={styles.label}>Action</Text>
        <ChoiceToggle
          options={[
            { value: 'terminal-command', label: 'Terminal Command' },
            { value: 'agent-prompt', label: 'Agent Prompt' }
          ]}
          value={draft.action}
          onChange={(action) => onChange({ action: action as QuickCommandDraft['action'] })}
        />
      </View>
      {isAgent ? (
        <View className={styles.field}>
          <Text className={styles.label}>Agent</Text>
          <Pressable
            className="border-border bg-card active:bg-accent flex-row items-center justify-between border px-3 py-2.5"
            onPress={onOpenAgentPicker}
          >
            {draft.agent ? (
              <View className="flex-row items-center gap-2">
                <MobileAgentIcon agentId={draft.agent} size={16} />
                <Text className="text-foreground text-sm">
                  {getQuickCommandAgentLabel(draft.agent)}
                </Text>
              </View>
            ) : (
              <Text className="text-muted-foreground text-sm">Choose agent</Text>
            )}
            <CaretDown size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      ) : null}
      <View className={styles.field}>
        <Text className={styles.label}>{isAgent ? 'Prompt' : 'Command Text'}</Text>
        <TextInput
          className={cn(styles.input, 'min-h-[92px]', !isAgent && 'font-mono')}
          style={{ textAlignVertical: 'top' }}
          value={isAgent ? draft.prompt : draft.command}
          onChangeText={(text) => onChange(isAgent ? { prompt: text } : { command: text })}
          placeholder={isAgent ? 'Ask the agent to investigate this workspace' : 'pnpm dev'}
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          maxLength={
            isAgent ? MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH : MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH
          }
          selectionColorClassName="accent-primary"
        />
        {isAgent ? (
          <Text className="text-muted-foreground text-xs">
            Supports skills, file paths, and built-in commands.
          </Text>
        ) : null}
      </View>
      <View className={styles.field}>
        <Pressable
          className="active:bg-accent flex-row items-center gap-1 py-1"
          onPress={() => setAdvancedOpen((open) => !open)}
          accessibilityState={{ expanded: advancedOpen }}
        >
          {advancedOpen ? (
            <CaretDown size={16} colorClassName="accent-muted-foreground" />
          ) : (
            <CaretRight size={16} colorClassName="accent-muted-foreground" />
          )}
          <Text className="text-muted-foreground text-xs font-semibold">Advanced</Text>
        </Pressable>
        {advancedOpen ? (
          <View className="gap-3 pt-1">
            {!isAgent ? (
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-foreground text-sm">Append Enter</Text>
                  <Text className="text-muted-foreground mt-px text-xs">
                    Submit immediately instead of only inserting text.
                  </Text>
                </View>
                <Switch
                  value={draft.appendEnter}
                  onValueChange={(appendEnter) => onChange({ appendEnter })}
                  trackColorOffClassName="accent-secondary"
                  trackColorOnClassName="accent-muted-foreground"
                  thumbColorClassName="accent-foreground"
                  ios_backgroundColorClassName="accent-secondary"
                />
              </View>
            ) : null}
            <View className={styles.field}>
              <Text className={styles.label}>Scope</Text>
              <ChoiceToggle
                options={[
                  { value: 'global', label: 'Global' },
                  { value: 'repo', label: 'Project', disabled: repoId === null }
                ]}
                value={draft.scope.type}
                onChange={(scopeType) =>
                  onChange({
                    scope:
                      scopeType === 'repo' && repoId ? { type: 'repo', repoId } : { type: 'global' }
                  })
                }
              />
              {draft.scope.type === 'repo' && repoName ? (
                <Text className="text-muted-foreground px-1 font-mono text-xs">{repoName}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      {error ? <Text className="text-destructive mt-1 text-xs">{error}</Text> : null}
      <View className="mt-2 flex-row gap-2">
        <Pressable
          className="border-border active:bg-accent flex-1 items-center border py-3"
          onPress={onCancel}
        >
          <Text className="text-foreground text-sm font-semibold">Cancel</Text>
        </Pressable>
        <Pressable
          className={cn(
            'flex-1 items-center bg-primary py-3 active:bg-accent',
            !canSave && styles.disabled
          )}
          disabled={!canSave}
          onPress={onSave}
        >
          <Text className="text-primary-foreground text-sm font-bold">
            {mode === 'edit' ? 'Save' : 'Add Quick Command'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = {
  field: cn('gap-2'),
  label: cn('text-xs font-semibold text-muted-foreground'),
  input: cn('border border-border bg-card px-3 py-2.5 text-sm text-foreground'),
  disabled: cn('opacity-[0.4]')
} as const
