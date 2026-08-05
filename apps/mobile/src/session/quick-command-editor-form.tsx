import { cn } from 'cnfast'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { CaretDown, CaretRight } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { MobileAgentIcon } from '../components/agent-icon'
import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'
import { MobileGlassSurface } from '../components/glass/surface'
import { MobileGlassTextButton } from '../components/glass/text-button'
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
}): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row gap-2" spacing={8}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <MobileGlassPressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: option.disabled }}
            className="h-9 w-full rounded-full"
            containerClassName="flex-1"
            contentClassName="h-full items-center justify-center rounded-full px-3"
            disabled={option.disabled}
            isSelected={selected}
            onPress={() => onChange(option.value)}
            size="regular"
          >
            <Text className={cn('text-muted-foreground text-xs', selected && 'text-foreground')}>
              {option.label}
            </Text>
          </MobileGlassPressable>
        )
      })}
    </MobileGlassGroup>
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
}: Props): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(draft.scope.type === 'repo')
  const isAgent = draft.action === 'agent-prompt'
  const canSave = isQuickCommandDraftValid(draft) && !saving
  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">
          {translate('mobile.quickCommand.editor.label', 'Label')}
        </Text>
        <MobileGlassSurface className="overflow-hidden rounded-xl" isInteractive>
          <TextInput
            className="text-foreground min-h-11 px-3 py-3 text-sm"
            value={draft.label}
            onChangeText={(label) => onChange({ label })}
            placeholder={translate(
              'mobile.quickCommand.editor.labelPlaceholder',
              'Start dev server'
            )}
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX_QUICK_COMMAND_LABEL_LENGTH}
            selectionColorClassName="accent-primary"
          />
        </MobileGlassSurface>
      </View>
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">
          {translate('mobile.quickCommand.editor.actionLabel', 'Action')}
        </Text>
        <ChoiceToggle
          options={[
            {
              value: 'terminal-command',
              label: translate(
                'mobile.quickCommand.editor.terminalCommandAction',
                'Terminal Command'
              )
            },
            {
              value: 'agent-prompt',
              label: translate('mobile.quickCommand.editor.agentPromptAction', 'Agent Prompt')
            }
          ]}
          value={draft.action}
          onChange={(action) => onChange({ action: action as QuickCommandDraft['action'] })}
        />
      </View>
      {isAgent ? (
        <View className="gap-2">
          <Text className="text-muted-foreground text-xs">
            {translate('mobile.quickCommand.editor.agentLabel', 'Agent')}
          </Text>
          <MobileGlassPressable
            className="rounded-xl"
            contentClassName="flex-row items-center justify-between px-3 py-3"
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
              <Text className="text-muted-foreground text-sm">
                {translate('mobile.quickCommand.editor.chooseAgent', 'Choose agent')}
              </Text>
            )}
            <CaretDown size={16} colorClassName="accent-muted-foreground" />
          </MobileGlassPressable>
        </View>
      ) : null}
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">
          {isAgent
            ? translate('mobile.quickCommand.editor.promptLabel', 'Prompt')
            : translate('mobile.quickCommand.editor.commandTextLabel', 'Command Text')}
        </Text>
        <MobileGlassSurface className="min-h-24 overflow-hidden rounded-xl" isInteractive>
          <TextInput
            className={cn('text-foreground min-h-24 px-3 py-3 text-sm', !isAgent && 'font-mono')}
            textAlignVertical="top"
            value={isAgent ? draft.prompt : draft.command}
            onChangeText={(text) => onChange(isAgent ? { prompt: text } : { command: text })}
            placeholder={
              isAgent
                ? translate(
                    'mobile.quickCommand.editor.promptPlaceholder',
                    'Ask the agent to investigate this workspace'
                  )
                : translate('mobile.quickCommand.editor.commandPlaceholder', 'pnpm dev')
            }
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            maxLength={
              isAgent
                ? MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH
                : MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH
            }
            selectionColorClassName="accent-primary"
          />
        </MobileGlassSurface>
        {isAgent ? (
          <Text className="text-muted-foreground text-xs">
            {translate(
              'mobile.quickCommand.editor.promptHint',
              'Supports skills, file paths, and built-in commands.'
            )}
          </Text>
        ) : null}
      </View>
      <View className="gap-2">
        <Pressable
          className="active:bg-accent min-h-11 flex-row items-center gap-1 py-1"
          onPress={() => setAdvancedOpen((open) => !open)}
          accessibilityState={{ expanded: advancedOpen }}
        >
          {advancedOpen ? (
            <CaretDown size={16} colorClassName="accent-muted-foreground" />
          ) : (
            <CaretRight size={16} colorClassName="accent-muted-foreground" />
          )}
          <Text className="text-muted-foreground text-xs font-semibold">
            {translate('mobile.quickCommand.editor.advancedLabel', 'Advanced')}
          </Text>
        </Pressable>
        {advancedOpen ? (
          <View className="gap-3 pt-1">
            {!isAgent ? (
              <SettingsToggleRow
                label={translate('mobile.quickCommand.appendEnter.label', 'Append Enter')}
                onValueChange={(appendEnter) => onChange({ appendEnter })}
                supportingText={translate(
                  'mobile.quickCommand.appendEnter.hint',
                  'Submit immediately instead of only inserting text.'
                )}
                value={draft.appendEnter}
              />
            ) : null}
            <View className="gap-2">
              <Text className="text-muted-foreground text-xs">
                {translate('mobile.quickCommand.editor.scopeLabel', 'Scope')}
              </Text>
              <ChoiceToggle
                options={[
                  {
                    value: 'global',
                    label: translate('mobile.quickCommand.editor.globalScope', 'Global')
                  },
                  {
                    value: 'repo',
                    label: translate('mobile.quickCommand.editor.projectScope', 'Project'),
                    disabled: repoId === null
                  }
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
                <Text className="text-muted-foreground font-mono text-xs">{repoName}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      {error ? <Text className="text-destructive mt-1 text-xs">{error}</Text> : null}
      <MobileGlassGroup className="mt-2 flex-row gap-2" spacing={8}>
        <MobileGlassTextButton
          className="flex-1"
          isFullWidth
          label={translate('mobile.quickCommand.editor.cancel', 'Cancel')}
          onPress={onCancel}
          size="large"
        />
        <MobileGlassTextButton
          className="flex-1"
          disabled={!canSave}
          isFullWidth
          isProminent
          label={
            mode === 'edit'
              ? translate('mobile.quickCommand.editor.save', 'Save')
              : translate('mobile.quickCommand.editor.add', 'Add Quick Command')
          }
          onPress={onSave}
          size="large"
        />
      </MobileGlassGroup>
    </View>
  )
}
