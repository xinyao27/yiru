import type React from 'react'
import { useState } from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import {
  normalizeLanguageServerSettings,
  type LanguageServerSettings
} from '../../../../shared/language-server'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { SearchableSetting } from './searchable-setting'
import { SettingsSubsectionHeader, SettingsSwitchRow } from './settings-form-controls'
import { translate } from '@/i18n/i18n'

type LanguageServerSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function LanguageServerSetting({
  settings,
  updateSettings
}: LanguageServerSettingProps): React.JSX.Element {
  const languageServer = normalizeLanguageServerSettings(settings.languageServer)
  const update = (updates: Partial<LanguageServerSettings>): void => {
    updateSettings({ languageServer: { ...languageServer, ...updates } })
  }
  const [commandDraft, setCommandDraft] = useSynchronizedDraft(languageServer.command)
  const [argumentsDraft, setArgumentsDraft] = useSynchronizedDraft(languageServer.args.join('\n'))
  const [languageIdsDraft, setLanguageIdsDraft] = useSynchronizedDraft(
    languageServer.languageIds.join(', ')
  )
  const parseArgumentsDraft = (): string[] =>
    argumentsDraft.split('\n').filter((value) => value.trim().length > 0)
  const parseLanguageIdsDraft = (): string[] =>
    languageIdsDraft
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  const commandMissing = languageServer.enabled && !languageServer.command
  const languagesMissing = languageServer.enabled && languageServer.languageIds.length === 0

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <SettingsSubsectionHeader
        title={translate(
          'auto.components.settings.LanguageServerSetting.title',
          'Language Server (Experimental)'
        )}
        description={translate(
          'auto.components.settings.LanguageServerSetting.description',
          'Run one language server on the native, WSL, SSH, or runtime host that owns the code.'
        )}
      />
      <SearchableSetting
        title={translate(
          'auto.components.settings.LanguageServerSetting.title',
          'Language Server (Experimental)'
        )}
        description={translate(
          'auto.components.settings.LanguageServerSetting.description',
          'Run one language server on the native, WSL, SSH, or runtime host that owns the code.'
        )}
        keywords={[
          'lsp',
          'language server',
          'hover',
          'definition',
          'diagnostics',
          'completion',
          'references',
          'symbols',
          'clangd'
        ]}
      >
        <div className="space-y-4">
          <SettingsSwitchRow
            label={translate(
              'auto.components.settings.LanguageServerSetting.enable',
              'Enable Language Server'
            )}
            description={translate(
              'auto.components.settings.LanguageServerSetting.enableDescription',
              'Run the configured executable on the code’s execution host when a matching file is open.'
            )}
            checked={languageServer.enabled}
            onChange={() =>
              update({
                enabled: !languageServer.enabled,
                command: commandDraft,
                args: parseArgumentsDraft(),
                languageIds: parseLanguageIdsDraft()
              })
            }
          />

          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="language-server-command">
                {translate('auto.components.settings.LanguageServerSetting.command', 'Executable')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.LanguageServerSetting.commandDescription',
                  'A PATH command available on each execution host, or an absolute host-specific executable path.'
                )}
              </p>
            </div>
            <Input
              id="language-server-command"
              value={commandDraft}
              placeholder={translate(
                'auto.components.settings.LanguageServerSetting.commandPlaceholder',
                'clangd'
              )}
              spellCheck={false}
              aria-invalid={commandMissing}
              onChange={(event) => setCommandDraft(event.target.value)}
              onBlur={() => update({ command: commandDraft })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
            />
            {commandMissing ? (
              <p className="text-xs text-destructive">
                {translate(
                  'auto.components.settings.LanguageServerSetting.commandRequired',
                  'Enter an executable before opening a matching source file.'
                )}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="language-server-arguments">
                {translate('auto.components.settings.LanguageServerSetting.arguments', 'Arguments')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.LanguageServerSetting.argumentsDescription',
                  'One argument per line. Include the server’s stdio flag when it requires one.'
                )}
              </p>
            </div>
            <Textarea
              id="language-server-arguments"
              className="min-h-20 font-mono text-xs"
              value={argumentsDraft}
              placeholder={translate(
                'auto.components.settings.LanguageServerSetting.argumentsPlaceholder',
                '--stdio\n--background-index'
              )}
              spellCheck={false}
              onChange={(event) => setArgumentsDraft(event.target.value)}
              onBlur={() => update({ args: parseArgumentsDraft() })}
            />
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="language-server-languages">
                {translate(
                  'auto.components.settings.LanguageServerSetting.languages',
                  'Monaco Language IDs'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.LanguageServerSetting.languagesDescription',
                  'Comma-separated IDs such as c, cpp. Only matching editable models are shared.'
                )}
              </p>
            </div>
            <Input
              id="language-server-languages"
              value={languageIdsDraft}
              placeholder={translate(
                'auto.components.settings.LanguageServerSetting.languagesPlaceholder',
                'c, cpp'
              )}
              spellCheck={false}
              aria-invalid={languagesMissing}
              onChange={(event) => setLanguageIdsDraft(event.target.value)}
              onBlur={() => update({ languageIds: parseLanguageIdsDraft() })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'auto.components.settings.LanguageServerSetting.localOnly',
                'Rename and code-action edits require preview; unsolicited edits, file operations, and commands are rejected.'
              )}
            </p>
          </div>
        </div>
      </SearchableSetting>
    </div>
  )
}

function useSynchronizedDraft(source: string): [string, (value: string) => void] {
  const [state, setState] = useState(() => ({ source, draft: source }))
  const resolved = state.source === source ? state : { source, draft: source }
  if (resolved !== state) {
    setState(resolved)
  }
  return [resolved.draft, (draft) => setState((current) => ({ ...current, draft }))]
}
