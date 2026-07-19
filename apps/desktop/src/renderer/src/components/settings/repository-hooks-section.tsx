/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: repository hook saves synchronize debounced persistence state with external repo settings. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { resolveHookCommandSourcePolicy } from '../../../../shared/hook-command-source-policy'
import type {
  HookCommandSourcePolicy,
  YiruHooks,
  Repo,
  RepoHookSettings,
  SetupAgentStartupPolicy,
  SetupRunPolicy
} from '../../../../shared/types'
import { LocalCommandSourceNotice, SegmentedPolicyToggle } from './repository-hook-policy-controls'
import { ScriptEditor } from './repository-hook-script-editor'
import {
  getCommandSourcePolicyOptions,
  getLocalCommandSourcePolicyNotice,
  getLocalHookFields,
  getParseErrorFixes,
  getSetupRunPolicyOptions,
  getYamlStateCopy,
  type LocalCommandSourcePolicyNotice as LocalCommandSourcePolicyNoticeType
} from './repository-hook-settings-model'
import { RepositoryHooksAdvancedSection } from './repository-hooks-advanced-section'
import { getRepositoryLocalCommandsSectionId } from './repository-settings-targets'
import { SearchableSetting } from './searchable-setting'
import { SettingsSwitch } from './settings-form-controls'
import { matchesSettingsSearch } from './settings-search'
import { useRepositoryHookSettingsDraft } from './use-repository-hook-settings-draft'

export { getLocalCommandSourcePolicyNotice } from './repository-hook-settings-model'
export type LocalCommandSourcePolicyNotice = LocalCommandSourcePolicyNoticeType

type RepositoryHooksSectionProps = {
  repo: Repo
  yamlHooks: YiruHooks | null
  hasHooksFile: boolean
  hooksInspectionReady: boolean
  mayNeedUpdate: boolean
  copiedTemplate: boolean
  forceVisible?: boolean
  onCopyTemplate: () => void
  onUpdateHookSettings: (settings: RepoHookSettings) => void
}

export function RepositoryHooksSection({
  repo,
  yamlHooks,
  hasHooksFile,
  hooksInspectionReady,
  mayNeedUpdate,
  copiedTemplate,
  forceVisible = false,
  onCopyTemplate,
  onUpdateHookSettings
}: RepositoryHooksSectionProps): React.JSX.Element {
  // Why: this component uses the lightweight translate() helper; subscribe here
  // so render-time option/copy builders refresh when the UI language changes.
  useTranslation()
  const settingsSearchQuery = useAppStore((s) => s.settingsSearchQuery)
  const selectedHostId = getRepoExecutionHostId(repo)
  const repoHostIdentity = `${selectedHostId}\0${repo.id}`
  const yamlState = yamlHooks
    ? 'loaded'
    : hasHooksFile
      ? mayNeedUpdate
        ? 'update-available'
        : 'invalid'
      : 'missing'

  const {
    hookSettingsDraft,
    updateScriptDraft,
    commitScriptDraft,
    flushScriptDraftOnUnmount,
    updateHookSettingsPolicyDraft
  } = useRepositoryHookSettingsDraft({ repo, repoHostIdentity, onUpdateHookSettings })
  const selectedSetupRunPolicy: SetupRunPolicy =
    hookSettingsDraft.setupRunPolicy ?? 'run-by-default'
  const selectedSetupAgentStartupPolicy: SetupAgentStartupPolicy =
    hookSettingsDraft.setupAgentStartupPolicy ?? 'start-immediately'
  const setupRunPolicyOptions = getSetupRunPolicyOptions()
  const commandSourcePolicyOptions = getCommandSourcePolicyOptions()
  const localHookFields = getLocalHookFields()
  const yamlStateCopy = getYamlStateCopy(yamlState)
  const parseErrorFixes = getParseErrorFixes()

  const sharedSetupScript = yamlHooks?.scripts.setup
  const sharedArchiveScript = yamlHooks?.scripts.archive
  const hasSharedSetupScript = Boolean(sharedSetupScript?.trim())
  const hasSharedArchiveScript = Boolean(sharedArchiveScript?.trim())
  const hasSharedScript = Boolean(sharedSetupScript?.trim() || sharedArchiveScript?.trim())
  const hasLocalScript = Boolean(
    hookSettingsDraft.scripts.setup?.trim() || hookSettingsDraft.scripts.archive?.trim()
  )
  const selectedCommandSourcePolicy: HookCommandSourcePolicy = resolveHookCommandSourcePolicy(
    hookSettingsDraft.commandSourcePolicy,
    { hasLocalScript }
  )
  const localCommandSourceNotice = getLocalCommandSourcePolicyNotice({
    hooksInspectionReady,
    currentPolicy: selectedCommandSourcePolicy,
    setupScript: hookSettingsDraft.scripts.setup,
    archiveScript: hookSettingsDraft.scripts.archive,
    hasSharedScript
  })
  const advancedMatchesSearch =
    settingsSearchQuery.trim() !== '' &&
    matchesSettingsSearch(settingsSearchQuery, {
      title: translate('auto.components.settings.RepositoryHooksSection.c9bc1bfd8f', 'Advanced'),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.610d90fdbd',
        'Command source and yiru.yaml details.'
      ),
      keywords: [
        translate('auto.components.settings.RepositoryHooksSection.c5a55a2d2e', 'advanced'),
        translate('auto.components.settings.RepositoryHooksSection.4611b78617', 'command source'),
        translate('auto.components.settings.RepositoryHooksSection.39da2ae12f', 'yiru.yaml'),
        translate('auto.components.settings.RepositoryHooksSection.d2b3016c20', 'shared'),
        translate('auto.components.settings.RepositoryHooksSection.2d03a514db', 'local'),
        translate('auto.components.settings.RepositoryHooksSection.0518758f38', 'both'),
        translate('auto.components.settings.RepositoryHooksSection.fac13f8c1e', 'authoritative')
      ]
    })
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  return (
    <section ref={flushScriptDraftOnUnmount} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">
          {translate(
            'auto.components.settings.RepositoryHooksSection.ff082fe7c6',
            'Worktree Hooks'
          )}
        </h2>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.RepositoryHooksSection.8567127a40',
            'Scripts that run when worktrees are created or archived. Local scripts are stored on this machine; `yiru.yaml` scripts are shared with your team.'
          )}
        </p>
      </div>

      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryHooksSection.52b31baf02',
          'Setup Script'
        )}
        description={translate(
          'auto.components.settings.RepositoryHooksSection.30d555acd2',
          'Local and shared scripts that run after a new worktree is created.'
        )}
        forceVisible={forceVisible}
        keywords={[
          'setup',
          'script',
          'command',
          'local',
          'local settings scripts',
          'yiru.yaml',
          'yiru.yaml hooks',
          'hook'
        ]}
      >
        <ScriptEditor
          key={`${repo.id}:setup`}
          field={localHookFields[0]}
          value={hookSettingsDraft.scripts.setup ?? ''}
          hasShared={hasSharedSetupScript}
          sharedScript={sharedSetupScript}
          onChange={(next) => updateScriptDraft('setup', next)}
          onCommit={commitScriptDraft}
          sectionId={getRepositoryLocalCommandsSectionId(repo.id)}
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryHooksSection.fb6bebcf7e',
          'When to Run Setup'
        )}
        description={translate(
          'auto.components.settings.RepositoryHooksSection.63e1783173',
          'Choose the default behavior when a setup script is available.'
        )}
        forceVisible={forceVisible}
        keywords={['setup run policy', 'ask', 'run by default', 'skip by default']}
      >
        <div className="border-border/50 bg-background/80 space-y-4 rounded-2xl border p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h5 className="text-sm font-semibold">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.793dcee97d',
                  'When to run'
                )}
              </h5>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.21fb607a87',
                  'Default behavior when a new worktree is created.'
                )}
              </p>
            </div>
            <SegmentedPolicyToggle
              options={setupRunPolicyOptions}
              selected={selectedSetupRunPolicy}
              onSelect={(policy) => updateHookSettingsPolicyDraft({ setupRunPolicy: policy })}
            />
          </div>
          <div className="border-border/60 flex items-start justify-between gap-4 border-t pt-4">
            <div className="min-w-0 space-y-1">
              <h5 className="text-sm font-semibold">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.waitForSetupBeforeAgent',
                  'Wait for setup to complete before starting agent'
                )}
              </h5>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.waitForSetupBeforeAgentHelp',
                  'Turn this on when setup installs dependencies, MCP servers, or config files the agent needs during startup.'
                )}
              </p>
            </div>
            <SettingsSwitch
              checked={selectedSetupAgentStartupPolicy === 'wait-for-setup'}
              onChange={() =>
                updateHookSettingsPolicyDraft({
                  setupAgentStartupPolicy:
                    selectedSetupAgentStartupPolicy === 'wait-for-setup'
                      ? 'start-immediately'
                      : 'wait-for-setup'
                })
              }
              ariaLabel={translate(
                'auto.components.settings.RepositoryHooksSection.waitForSetupBeforeAgent',
                'Wait for setup to complete before starting agent'
              )}
            />
          </div>
        </div>
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryHooksSection.9a100323ff',
          'Archive Script'
        )}
        description={translate(
          'auto.components.settings.RepositoryHooksSection.b91a0f297d',
          'Local and shared scripts that run before a worktree is archived.'
        )}
        forceVisible={forceVisible}
        keywords={[
          'archive',
          'script',
          'command',
          'local',
          'local settings scripts',
          'yiru.yaml',
          'yiru.yaml hooks',
          'hook'
        ]}
      >
        <ScriptEditor
          key={`${repo.id}:archive`}
          field={localHookFields[1]}
          value={hookSettingsDraft.scripts.archive ?? ''}
          hasShared={hasSharedArchiveScript}
          sharedScript={sharedArchiveScript}
          onChange={(next) => updateScriptDraft('archive', next)}
          onCommit={commitScriptDraft}
        />
      </SearchableSetting>

      {localCommandSourceNotice ? (
        <LocalCommandSourceNotice
          notice={localCommandSourceNotice}
          onSelectPolicy={(policy) =>
            updateHookSettingsPolicyDraft({ commandSourcePolicy: policy })
          }
        />
      ) : null}

      <RepositoryHooksAdvancedSection
        forceVisible={forceVisible}
        advancedMatchesSearch={advancedMatchesSearch}
        isAdvancedOpen={isAdvancedOpen}
        onAdvancedOpenChange={setIsAdvancedOpen}
        selectedCommandSourcePolicy={selectedCommandSourcePolicy}
        commandSourcePolicyOptions={commandSourcePolicyOptions}
        onSelectPolicy={(policy) => updateHookSettingsPolicyDraft({ commandSourcePolicy: policy })}
        yamlState={yamlState}
        yamlStateCopy={yamlStateCopy}
        yamlHooks={yamlHooks}
        parseErrorFixes={parseErrorFixes}
        copiedTemplate={copiedTemplate}
        onCopyTemplate={onCopyTemplate}
      />
    </section>
  )
}
