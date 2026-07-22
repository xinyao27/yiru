import { useCallback, useEffect, useRef, useState } from 'react'

import { CaretDown as ChevronDown } from '@/components/regular-icons'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { buildBranchNamePrompt } from '../../../../shared/branch-name-from-work'
import { normalizeSourceControlAiSettings } from '../../../../shared/source-control-ai'
import {
  resolveSourceControlActionCommandTemplate,
  setSourceControlActionDefault
} from '../../../../shared/source-control-ai-actions'
import type {
  SourceControlAiSettingsPatch,
  SourceControlAiSettings
} from '../../../../shared/source-control-ai-types'
import type { GlobalSettings } from '../../../../shared/types'
import { useAppStore } from '../../store'
import { SourceControlActionVariableChips } from '../source-control/source-control-action-variable-chips'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { getAutoRenameBranchAdvancedSearchEntries } from './auto-rename-branch-search'
import { SearchableSetting } from './searchable-setting'
import { matchesSettingsSearch, normalizeSettingsSearchQuery } from './settings-search'

type AutoRenameBranchFromWorkSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  writeSourceControlAiSettings: (patch: SourceControlAiSettingsPatch) => Promise<void>
  forceVisible?: boolean
  onBranchPromptDirtyChange?: (dirty: boolean) => void
  branchPromptDiscardSignal?: number
  settingsSearchQuery?: string
}

const BUILT_IN_BRANCH_NAME_PROMPT = buildBranchNamePrompt({
  firstPrompt: '{first agent prompt}',
  assistantMessage: '{agent initial response, when available}'
})
export function shouldOpenAutoRenameBranchAdvanced(searchQuery: string): boolean {
  return (
    normalizeSettingsSearchQuery(searchQuery) !== '' &&
    matchesSettingsSearch(searchQuery, getAutoRenameBranchAdvancedSearchEntries())
  )
}

function readSourceControlSettings(settings: GlobalSettings): SourceControlAiSettings {
  return normalizeSourceControlAiSettings(settings.sourceControlAi, settings.commitMessageAi)
}

export function AutoRenameBranchFromWorkSetting({
  settings,
  updateSettings,
  writeSourceControlAiSettings,
  forceVisible = false,
  onBranchPromptDirtyChange,
  branchPromptDiscardSignal,
  settingsSearchQuery
}: AutoRenameBranchFromWorkSettingProps): React.JSX.Element {
  const storeSearchQuery = useAppStore((state) => state.settingsSearchQuery)
  const searchQuery = settingsSearchQuery ?? storeSearchQuery
  const config = readSourceControlSettings(settings)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const advancedSearchOpen = shouldOpenAutoRenameBranchAdvanced(searchQuery)
  const advancedOpen = optionsOpen || advancedSearchOpen
  const persistedBranchNameTemplate = resolveSourceControlActionCommandTemplate(
    config.actions,
    'branchName'
  )
  const persistedBranchNameTemplateRef = useRef(persistedBranchNameTemplate)
  persistedBranchNameTemplateRef.current = persistedBranchNameTemplate
  const [branchNameTemplateDraft, setBranchNameTemplateDraft] = useState(
    persistedBranchNameTemplate
  )
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)
  const branchNamePromptDirty = branchNameTemplateDraft !== persistedBranchNameTemplate

  useEffect(() => {
    if (!branchNamePromptDirty) {
      setBranchNameTemplateDraft(persistedBranchNameTemplate)
    }
  }, [branchNamePromptDirty, persistedBranchNameTemplate])

  useEffect(() => {
    setBranchNameTemplateDraft(persistedBranchNameTemplateRef.current)
    // Why: Settings owns the discard confirmation, but the draft lives here so
    // the row can keep its prompt-specific save/discard affordances.
  }, [branchPromptDiscardSignal])

  useEffect(() => {
    onBranchPromptDirtyChange?.(branchNamePromptDirty)
  }, [branchNamePromptDirty, onBranchPromptDirtyChange])

  const onBranchPromptDirtyChangeRef = useRef(onBranchPromptDirtyChange)
  onBranchPromptDirtyChangeRef.current = onBranchPromptDirtyChange
  const setSettingRootRef = useCallback((node: HTMLDivElement | null): void => {
    if (node !== null) {
      return
    }
    // Why: Settings owns the global unsaved-branch-prompt guard; reset it
    // when this setting detaches without a passive cleanup-only Effect.
    onBranchPromptDirtyChangeRef.current?.(false)
  }, [])

  const onSavePrompt = async (): Promise<void> => {
    if (!branchNamePromptDirty || isSavingPrompt) {
      return
    }
    setIsSavingPrompt(true)
    try {
      await writeSourceControlAiSettings((current) => ({
        actions: setSourceControlActionDefault(current.actions, 'branchName', {
          commandInputTemplate: branchNameTemplateDraft
        })
      }))
    } finally {
      setIsSavingPrompt(false)
    }
  }

  const onDiscardPrompt = (): void => {
    setBranchNameTemplateDraft(persistedBranchNameTemplate)
  }

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.AutoRenameBranchFromWorkSetting.ef787db0e3',
        'Auto-rename branch & worktree'
      )}
      description={translate(
        'auto.components.settings.AutoRenameBranchFromWorkSetting.6a051586d2',
        'Rename the auto-generated branch based on the work once an agent starts.'
      )}
      keywords={[
        'branch',
        'rename',
        'auto',
        'creature name',
        'agent',
        'prompt',
        'command',
        'template',
        'worktree',
        'slug'
      ]}
      forceVisible={forceVisible || branchNamePromptDirty || advancedSearchOpen}
      className="space-y-3 py-2"
    >
      <div ref={setSettingRootRef} className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.AutoRenameBranchFromWorkSetting.ef787db0e3',
              'Auto-rename branch & worktree'
            )}
          </Label>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AutoRenameBranchFromWorkSetting.12ea4a408d',
              'When an agent starts working in a new workspace, Yiru renames its auto-generated branch (e.g.'
            )}
            <code>
              {translate(
                'auto.components.settings.AutoRenameBranchFromWorkSetting.1626524572',
                'Nautilus'
              )}
            </code>
            {translate(
              'auto.components.settings.AutoRenameBranchFromWorkSetting.d9b65054ef',
              ') to a short name summarizing the task. Only branches Yiru named itself are renamed, and never after they have been pushed.'
            )}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={settings.autoRenameBranchFromWork}
          onClick={() =>
            updateSettings({
              autoRenameBranchFromWork: !settings.autoRenameBranchFromWork
            })
          }
          className={cn(
            'outline-none focus-visible:border-ring',
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
            settings.autoRenameBranchFromWork ? 'bg-foreground' : 'bg-muted-foreground/30'
          )}
        >
          <span
            className={cn(
              'pointer-events-none block size-3.5 rounded-full bg-background transition-transform',
              settings.autoRenameBranchFromWork ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setOptionsOpen}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground -ml-2 h-7 px-2 text-xs"
            >
              {translate(
                'auto.components.settings.AutoRenameBranchFromWorkSetting.e784ea62dc',
                'Advanced'
              )}
              <ChevronDown
                className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-180')}
              />
            </Button>
          }
        />
        <CollapsibleContent>
          <div className="border-border/60 bg-muted/20 mt-2 space-y-3 rounded-md border px-3 py-3">
            <div className="space-y-2">
              <div className="space-y-0.5">
                <Label htmlFor="git-auto-rename-branch-name-template">
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.a869d0edd8',
                    'Branch name command template'
                  )}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.9241b59bf5',
                    'Use'
                  )}
                  <code className="font-mono">
                    {translate(
                      'auto.components.settings.AutoRenameBranchFromWorkSetting.c71770c455',
                      '{basePrompt}'
                    )}
                  </code>{' '}
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.69bf4830c2',
                    "to include Yiru's"
                  )}{' '}
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="text-foreground decoration-border hover:decoration-foreground inline rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none"
                        >
                          {translate(
                            'auto.components.settings.AutoRenameBranchFromWorkSetting.9c9b54e4ea',
                            'built-in branch-name prompt'
                          )}
                        </button>
                      }
                    />
                    <PopoverContent
                      align="start"
                      side="bottom"
                      className="w-[520px] max-w-[calc(100vw-2rem)] p-3"
                    >
                      <div>
                        <pre className="scrollbar-sleek border-border bg-background text-muted-foreground max-h-72 overflow-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                          {BUILT_IN_BRANCH_NAME_PROMPT}
                        </pre>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.56580dcf60',
                    '. You can also reference'
                  )}
                  <code className="font-mono">
                    {translate(
                      'auto.components.settings.AutoRenameBranchFromWorkSetting.2ee2779c05',
                      '{firstPrompt}'
                    )}
                  </code>{' '}
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.570817d126',
                    'and'
                  )}{' '}
                  <code className="font-mono">
                    {translate(
                      'auto.components.settings.AutoRenameBranchFromWorkSetting.a4fa380b67',
                      '{assistantMessage}'
                    )}
                  </code>
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.5d569f5199',
                    '. Yiru generates only the final segment, like'
                  )}
                  <code className="font-mono">
                    {translate(
                      'auto.components.settings.AutoRenameBranchFromWorkSetting.800edb1e54',
                      'fix-login-flow'
                    )}
                  </code>
                  {translate(
                    'auto.components.settings.AutoRenameBranchFromWorkSetting.f19a56498d',
                    '; your branch prefix setting still applies.'
                  )}
                </p>
              </div>
              <textarea
                id="git-auto-rename-branch-name-template"
                rows={4}
                value={branchNameTemplateDraft}
                onChange={(event) => setBranchNameTemplateDraft(event.target.value)}
                placeholder={translate(
                  'auto.components.settings.AutoRenameBranchFromWorkSetting.c71770c455',
                  '{basePrompt}'
                )}
                className="border-border bg-background text-foreground placeholder:text-muted-foreground/70 w-full resize-y rounded-md border px-2 py-1.5 font-mono text-xs outline-none"
              />
              <SourceControlActionVariableChips
                actionId="branchName"
                onInsert={(variable) => {
                  const separator =
                    branchNameTemplateDraft.endsWith('\n') || branchNameTemplateDraft.length === 0
                      ? ''
                      : ' '
                  setBranchNameTemplateDraft(`${branchNameTemplateDraft}${separator}{${variable}}`)
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-[11px]">
                  {branchNamePromptDirty
                    ? translate(
                        'auto.components.settings.AutoRenameBranchFromWorkSetting.7c7e34a66d',
                        'Unsaved changes'
                      )
                    : translate(
                        'auto.components.settings.AutoRenameBranchFromWorkSetting.40e7be7850',
                        'Saved'
                      )}
                </p>
                <div className="flex items-center gap-2">
                  {branchNamePromptDirty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={onDiscardPrompt}
                      disabled={isSavingPrompt}
                    >
                      {translate(
                        'auto.components.settings.AutoRenameBranchFromWorkSetting.0de9fda203',
                        'Discard'
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => void onSavePrompt()}
                    disabled={!branchNamePromptDirty || isSavingPrompt}
                  >
                    {isSavingPrompt
                      ? translate(
                          'auto.components.settings.AutoRenameBranchFromWorkSetting.cfd82406dd',
                          'Saving...'
                        )
                      : translate(
                          'auto.components.settings.AutoRenameBranchFromWorkSetting.ec3e0c388e',
                          'Save'
                        )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </SearchableSetting>
  )
}
