import { useState } from 'react'
import { Pressable, Switch, Text, TextInput, View } from 'react-native'

import { CaretDown, CaretRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileAgentIcon } from '../components/mobile-agent-icon'
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
    <View className={styles.toggleGroup}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Pressable
            key={option.value}
            className={cn(
              styles.toggleItem,
              selected && styles.toggleItemSelected,
              option.disabled && styles.disabled
            )}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: option.disabled }}
          >
            <Text className={cn(styles.toggleText, selected && styles.toggleTextSelected)}>
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
    <View className={styles.form}>
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
          <Pressable className={styles.select} onPress={onOpenAgentPicker}>
            {draft.agent ? (
              <View className={styles.selectValue}>
                <MobileAgentIcon agentId={draft.agent} size={16} />
                <Text className={styles.selectValueText}>
                  {getQuickCommandAgentLabel(draft.agent)}
                </Text>
              </View>
            ) : (
              <Text className={styles.selectPlaceholder}>Choose agent</Text>
            )}
            <CaretDown size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      ) : null}
      <View className={styles.field}>
        <Text className={styles.label}>{isAgent ? 'Prompt' : 'Command Text'}</Text>
        <TextInput
          className={cn(styles.input, styles.textarea, !isAgent && styles.mono)}
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
          <Text className={styles.hint}>Supports skills, file paths, and built-in commands.</Text>
        ) : null}
      </View>
      <View className={styles.field}>
        <Pressable
          className={styles.advancedToggle}
          onPress={() => setAdvancedOpen((open) => !open)}
          accessibilityState={{ expanded: advancedOpen }}
        >
          {advancedOpen ? (
            <CaretDown size={16} colorClassName="accent-muted-foreground" />
          ) : (
            <CaretRight size={16} colorClassName="accent-muted-foreground" />
          )}
          <Text className={styles.advancedText}>Advanced</Text>
        </Pressable>
        {advancedOpen ? (
          <View className={styles.advancedBody}>
            {!isAgent ? (
              <View className={styles.switchRow}>
                <View className={styles.switchText}>
                  <Text className={styles.switchTitle}>Append Enter</Text>
                  <Text className={styles.switchDesc}>
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
                <Text className={styles.scopeRepoName}>{repoName}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      {error ? <Text className={styles.error}>{error}</Text> : null}
      <View className={styles.footer}>
        <Pressable className={styles.cancelButton} onPress={onCancel}>
          <Text className={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          className={cn(styles.saveButton, !canSave && styles.disabled)}
          disabled={!canSave}
          onPress={onSave}
        >
          <Text className={styles.saveText}>{mode === 'edit' ? 'Save' : 'Add Quick Command'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = {
  form: cn('gap-3 pt-1 pb-2'),
  field: cn('gap-2'),
  label: cn('text-[12px] font-semibold text-muted-foreground'),
  input: cn('border border-border bg-card px-3 py-2.5 text-[14px] text-foreground'),
  textarea: cn('min-h-[92px]'),
  mono: cn('font-mono'),
  hint: cn('text-[12px] text-muted-foreground'),
  error: cn('mt-1 text-[13px] text-destructive'),
  disabled: cn('opacity-[0.4]'),
  toggleGroup: cn('flex-row gap-2'),
  toggleItem: cn('h-10 flex-1 items-center justify-center border border-border bg-card'),
  toggleItemSelected: cn('border-muted-foreground bg-accent'),
  toggleText: cn('text-[13px] font-medium text-muted-foreground'),
  toggleTextSelected: cn('text-foreground'),
  select: cn(
    'flex-row items-center justify-between border border-border bg-card px-3 py-2.5 active:bg-accent'
  ),
  selectValue: cn('flex-row items-center gap-2'),
  selectValueText: cn('text-[14px] text-foreground'),
  selectPlaceholder: cn('text-[14px] text-muted-foreground'),
  scopeRepoName: cn('px-1 font-mono text-[13px] text-muted-foreground'),
  advancedToggle: cn('flex-row items-center gap-1 py-1 active:bg-accent'),
  advancedText: cn('text-[13px] font-semibold text-muted-foreground'),
  advancedBody: cn('gap-3 pt-1'),
  switchRow: cn('flex-row items-center gap-3'),
  switchText: cn('flex-1'),
  switchTitle: cn('text-[14px] text-foreground'),
  switchDesc: cn('mt-px text-[12px] text-muted-foreground'),
  footer: cn('mt-2 flex-row gap-2'),
  cancelButton: cn('flex-1 items-center border border-border py-3 active:bg-accent'),
  cancelText: cn('text-[14px] font-semibold text-foreground'),
  saveButton: cn('flex-1 items-center bg-foreground py-3 active:opacity-[0.7]'),
  saveText: cn('text-[14px] font-bold text-background')
} as const
