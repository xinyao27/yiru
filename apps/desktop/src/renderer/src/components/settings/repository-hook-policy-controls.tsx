import { Warning as AlertTriangle } from '@phosphor-icons/react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { Button } from '../ui/button'
import {
  EXAMPLE_TEMPLATE,
  type LocalCommandSourcePolicyNotice,
  type PolicyOption
} from './repository-hook-settings-model'

export function PolicyOptionGrid<P extends string>({
  options,
  selected,
  onSelect,
  columns
}: {
  options: PolicyOption<P>[]
  selected: P
  onSelect: (p: P) => void
  columns: string
}): React.JSX.Element {
  return (
    <div className={cn('grid gap-2', columns)}>
      {options.map(({ policy, label, description }) => {
        const active = selected === policy
        return (
          <button
            type="button"
            key={policy}
            onClick={() => onSelect(policy)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-center transition-colors',
              active
                ? 'border-foreground/15 bg-accent text-accent-foreground'
                : 'border-border/60 bg-background text-foreground hover:border-border hover:bg-muted/40'
            )}
          >
            <span className={cn('block text-sm', active ? 'font-semibold' : 'font-medium')}>
              {label}
            </span>
            <p
              className={cn(
                'mt-1 text-[11px] leading-4',
                active ? 'text-accent-foreground/80' : 'text-muted-foreground'
              )}
            >
              {description}
            </p>
          </button>
        )
      })}
    </div>
  )
}

export function SegmentedPolicyToggle<P extends string>({
  options,
  selected,
  onSelect
}: {
  options: PolicyOption<P>[]
  selected: P
  onSelect: (p: P) => void
}): React.JSX.Element {
  return (
    <div className="border-border/60 bg-muted/50 inline-flex gap-0.5 rounded-lg border p-0.5">
      {options.map(({ policy, label, description }) => {
        const active = selected === policy
        return (
          <button
            type="button"
            key={policy}
            onClick={() => onSelect(policy)}
            title={description}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function ExampleTemplateCard({
  copiedTemplate,
  onCopyTemplate
}: {
  copiedTemplate: boolean
  onCopyTemplate: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[10px] tracking-[0.18em]">
        {translate('auto.components.settings.RepositoryHooksSection.175daba180', 'Example')}
        <code className="bg-muted rounded px-1 py-0.5">
          {translate('auto.components.settings.RepositoryHooksSection.39da2ae12f', 'yiru.yaml')}
        </code>{' '}
        {translate('auto.components.settings.RepositoryHooksSection.95a0411b3e', 'template')}
      </p>
      <div className="border-border/50 bg-background/70 relative rounded-lg border">
        <Button
          type="button"
          variant={copiedTemplate ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'absolute right-2 top-2 z-10 h-6 px-2 text-[11px]',
            copiedTemplate ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={onCopyTemplate}
        >
          {copiedTemplate
            ? translate('auto.components.settings.RepositoryHooksSection.3149964b66', 'Copied')
            : translate('auto.components.settings.RepositoryHooksSection.da37d6f10e', 'Copy')}
        </Button>
        <pre className="text-muted-foreground overflow-x-auto p-3 pr-16 font-mono text-[11px] leading-5 break-words whitespace-pre-wrap">
          {EXAMPLE_TEMPLATE}
        </pre>
      </div>
    </div>
  )
}

export function YamlScriptBlock({ content }: { content: string }): React.JSX.Element {
  return (
    <pre className="border-border/50 bg-muted/30 text-foreground overflow-x-auto rounded-lg border p-3 font-mono text-[11.5px] leading-5 break-words whitespace-pre-wrap">
      {content}
    </pre>
  )
}

export function LocalCommandSourceNotice({
  notice,
  onSelectPolicy
}: {
  notice: LocalCommandSourcePolicyNotice
  onSelectPolicy: (policy: 'local-only' | 'run-both') => void
}): React.JSX.Element {
  const isChecking = notice.kind === 'checking'
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {translate(
              'auto.components.settings.RepositoryHooksSection.5426ecbdcb',
              'Local scripts will not run'
            )}
          </p>
          <p className="text-muted-foreground text-xs leading-5">
            {isChecking
              ? translate(
                  'auto.components.settings.RepositoryHooksSection.7f78e5eea6',
                  'Local scripts are saved. Yiru is still checking yiru.yaml before it can recommend which script source to use.'
                )
              : translate(
                  'auto.components.settings.RepositoryHooksSection.0ce113fd7b',
                  'Local scripts are saved, but Script Source is set to yiru.yaml only.'
                )}
          </p>
        </div>
      </div>
      {notice.kind === 'action' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onSelectPolicy(notice.policy)}
        >
          {notice.label}
        </Button>
      ) : (
        <span className="border-border/60 bg-muted/30 text-muted-foreground shrink-0 rounded-full border px-2 py-1 text-[11px]">
          {translate('auto.components.settings.RepositoryHooksSection.673a7fd10e', 'Checking...')}
        </span>
      )}
    </div>
  )
}
