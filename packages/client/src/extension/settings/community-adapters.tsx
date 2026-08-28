import { useActionState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'
import { Textarea } from '~renderer/ui/textarea'

import type { CommunityAdapter, DaemonSettingsPageProps } from './page'

type AdapterState = { kind: 'idle' | 'error' }

export function CommunityAdaptersSettings(
  props: Pick<
    DaemonSettingsPageProps,
    | 'communityAdaptersDisabled'
    | 'initialCommunityAdapters'
    | 'onOpenUserScriptsSettings'
    | 'onRemoveCommunityAdapter'
    | 'onSaveCommunityAdapter'
  >
): React.JSX.Element {
  const [state, saveAction, isSaving] = useActionState<AdapterState, FormData>(
    async (_current, formData) => {
      const name = formData.get('adapter-name')
      const match = formData.get('adapter-match')
      const code = formData.get('adapter-code')
      if (typeof name !== 'string' || typeof match !== 'string' || typeof code !== 'string') {
        return { kind: 'error' }
      }
      try {
        await props.onSaveCommunityAdapter({ code, match, name })
        location.reload()
        return { kind: 'idle' }
      } catch {
        return { kind: 'error' }
      }
    },
    { kind: 'idle' }
  )
  return (
    <section className="border-border bg-card mx-auto mt-4 max-w-xl border p-5">
      <h2 className="text-base font-semibold">
        {translate('extension.settings.adapters', 'Community site adapters')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translate(
          'extension.settings.adaptersDescription',
          'Reviewable scripts run in Chrome’s isolated user-script world. They may add bounded context through document.documentElement.dataset.yiruContext, but never choose a project or execute an agent action.'
        )}
      </p>
      {props.communityAdaptersDisabled ? (
        <p className="text-muted-foreground mt-3 text-sm">
          {translate('extension.settings.adaptersManaged', 'Disabled by enterprise policy.')}
        </p>
      ) : (
        <form action={saveAction} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.adapterName', 'Adapter name')}</span>
            <Input name="adapter-name" required maxLength={100} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.adapterMatch', 'Exact site match')}</span>
            <Input
              name="adapter-match"
              type="text"
              required
              placeholder="https://jira.example.com/*"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.adapterCode', 'Reviewed JavaScript')}</span>
            <Textarea
              name="adapter-code"
              required
              spellCheck={false}
              placeholder="document.documentElement.dataset.yiruContext = document.title"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isSaving}>
              {translate('extension.settings.installAdapter', 'Review and install')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void props.onOpenUserScriptsSettings()}
            >
              {translate('extension.settings.userScriptsToggle', 'Open Chrome permission toggle')}
            </Button>
          </div>
        </form>
      )}
      {state.kind === 'error' ? (
        <p className="text-destructive mt-3 text-sm">
          {translate(
            'extension.settings.adapterFailed',
            'Nothing was installed. Use one exact HTTP(S) origin ending in /*, grant access, and enable Chrome’s Allow User Scripts toggle.'
          )}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {props.initialCommunityAdapters.map((adapter) => (
          <InstalledAdapter
            key={adapter.id}
            adapter={adapter}
            onRemove={props.onRemoveCommunityAdapter}
          />
        ))}
      </div>
    </section>
  )
}

function InstalledAdapter({
  adapter,
  onRemove
}: {
  adapter: CommunityAdapter
  onRemove: (id: string) => Promise<CommunityAdapter[]>
}): React.JSX.Element {
  return (
    <details className="border-border border p-3">
      <summary className="cursor-pointer text-sm font-medium">{adapter.name}</summary>
      <p className="text-muted-foreground mt-2 text-xs">{adapter.match}</p>
      <pre className="border-border mt-2 max-h-40 overflow-auto border p-2 text-xs whitespace-pre-wrap">
        {adapter.code}
      </pre>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="mt-2"
        onClick={() => void onRemove(adapter.id).then(() => location.reload())}
      >
        {translate('extension.settings.removeAdapter', 'Remove adapter')}
      </Button>
    </details>
  )
}
