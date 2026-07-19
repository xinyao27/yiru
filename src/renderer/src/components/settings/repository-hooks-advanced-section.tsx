import { Warning as AlertTriangle, CaretRight as ChevronRight } from '@phosphor-icons/react'
import type { HookCommandSourcePolicy, YiruHooks } from '../../../../shared/types'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './searchable-setting'
import {
  ExampleTemplateCard,
  PolicyOptionGrid,
  YamlScriptBlock
} from './repository-hook-policy-controls'
import {
  getCommandSourceLabel,
  type PolicyOption,
  YAML_STATE_STYLES
} from './repository-hook-settings-model'

export function RepositoryHooksAdvancedSection({
  forceVisible,
  advancedMatchesSearch,
  isAdvancedOpen,
  onAdvancedOpenChange,
  selectedCommandSourcePolicy,
  commandSourcePolicyOptions,
  onSelectPolicy,
  yamlState,
  yamlStateCopy,
  yamlHooks,
  parseErrorFixes,
  copiedTemplate,
  onCopyTemplate
}: {
  forceVisible: boolean
  advancedMatchesSearch: boolean
  isAdvancedOpen: boolean
  onAdvancedOpenChange: (open: boolean) => void
  selectedCommandSourcePolicy: HookCommandSourcePolicy
  commandSourcePolicyOptions: PolicyOption<HookCommandSourcePolicy>[]
  onSelectPolicy: (policy: HookCommandSourcePolicy) => void
  yamlState: string
  yamlStateCopy: { heading: string; description: string }
  yamlHooks: YiruHooks | null
  parseErrorFixes: readonly string[]
  copiedTemplate: boolean
  onCopyTemplate: () => void
}): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate('auto.components.settings.RepositoryHooksSection.c9bc1bfd8f', 'Advanced')}
      description={translate(
        'auto.components.settings.RepositoryHooksSection.610d90fdbd',
        'Command source and yiru.yaml details.'
      )}
      forceVisible={forceVisible}
      keywords={[
        'advanced',
        'command source',
        'yiru.yaml',
        'shared',
        'local',
        'both',
        'authoritative'
      ]}
    >
      <details
        className="group rounded-2xl border border-border/50 bg-background/80 shadow-sm"
        open={advancedMatchesSearch || isAdvancedOpen}
        onToggle={(event) => {
          if (advancedMatchesSearch) {
            event.currentTarget.open = true
            return
          }
          onAdvancedOpenChange(event.currentTarget.open)
        }}
      >
        <summary
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden"
          onClick={(event) => {
            if (advancedMatchesSearch) {
              event.preventDefault()
            }
          }}
        >
          <div className="flex items-center gap-2">
            <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            <h5 className="text-sm font-semibold">
              {translate('auto.components.settings.RepositoryHooksSection.c9bc1bfd8f', 'Advanced')}
            </h5>
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.RepositoryHooksSection.bbbd6e0bc4',
                'Command source & yiru.yaml'
              )}
            </span>
          </div>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
            {getCommandSourceLabel(selectedCommandSourcePolicy)}
          </span>
        </summary>

        <div className="space-y-5 border-t border-border/50 px-4 py-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.32fec28f5b',
                  'Command Source'
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.ac9038d2cc',
                  'When both'
                )}
                <code className="rounded bg-muted px-1 py-0.5">
                  {translate(
                    'auto.components.settings.RepositoryHooksSection.39da2ae12f',
                    'yiru.yaml'
                  )}
                </code>{' '}
                {translate(
                  'auto.components.settings.RepositoryHooksSection.3397879bee',
                  'and local commands exist, choose which run.'
                )}
              </p>
            </div>
            <PolicyOptionGrid
              options={commandSourcePolicyOptions}
              selected={selectedCommandSourcePolicy}
              onSelect={onSelectPolicy}
              columns="md:grid-cols-3"
            />
          </div>

          <div className={cn('space-y-3 rounded-xl border p-3', YAML_STATE_STYLES[yamlState].card)}>
            <div className="space-y-1">
              <p className={cn('text-sm font-medium', YAML_STATE_STYLES[yamlState].titleClassName)}>
                {yamlStateCopy.heading}
              </p>
              <p className="text-xs text-muted-foreground">{yamlStateCopy.description}</p>
            </div>

            {yamlState === 'loaded' ? (
              <YamlScriptBlock content={renderYamlScriptPreview(yamlHooks)} />
            ) : yamlState === 'invalid' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-background/60 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      {translate(
                        'auto.components.settings.RepositoryHooksSection.af49e2a19e',
                        'The file is present, but Yiru could not find valid `scripts` definitions.'
                      )}
                    </p>
                    <ol className="space-y-1.5 pl-4 text-[11.5px]">
                      {parseErrorFixes.map((fix) => (
                        <li key={fix} className="list-decimal leading-5">
                          {fix}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                <ExampleTemplateCard
                  copiedTemplate={copiedTemplate}
                  onCopyTemplate={onCopyTemplate}
                />
              </div>
            ) : (
              <ExampleTemplateCard
                copiedTemplate={copiedTemplate}
                onCopyTemplate={onCopyTemplate}
              />
            )}
          </div>
        </div>
      </details>
    </SearchableSetting>
  )
}

function renderYamlScriptPreview(hooks: YiruHooks | null): string {
  const format = (key: string, command?: string): string =>
    command ? `\n  ${key}: |\n${command.replace(/^/gm, '    ')}` : ''
  return `scripts:${format('setup', hooks?.scripts.setup)}${format('archive', hooks?.scripts.archive)}`
}
