import { useActionState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

import { CommunityAdaptersSettings } from './community-adapters'

export type DaemonConnectionSettings = {
  authToken: string
  endpoint: string
  protocolVersion: number
}

export type CommunityAdapter = {
  code: string
  id: string
  match: string
  name: string
}

export type DaemonSettingsPageProps = {
  communityAdaptersDisabled: boolean
  initialCommunityAdapters: CommunityAdapter[]
  initialSettings: DaemonConnectionSettings
  initialTrustedSites: string[]
  onOpenUserScriptsSettings: () => Promise<void>
  onReset: () => Promise<void>
  onRemoveCommunityAdapter: (id: string) => Promise<CommunityAdapter[]>
  onRevokeSite: (origin: string) => Promise<void>
  onSave: (settings: DaemonConnectionSettings) => Promise<void>
  onSaveCommunityAdapter: (
    adapter: Omit<CommunityAdapter, 'id'> & { id?: string }
  ) => Promise<CommunityAdapter[]>
}

type SaveState = { kind: 'idle' | 'saved' | 'error' }

export function DaemonSettingsPage(props: DaemonSettingsPageProps): React.JSX.Element {
  const [state, saveAction, isSaving] = useActionState<SaveState, FormData>(
    async (_current, formData) => {
      const endpoint = formData.get('endpoint')
      const authToken = formData.get('auth-token')
      const protocolVersion = Number(formData.get('protocol-version'))
      if (
        typeof endpoint !== 'string' ||
        typeof authToken !== 'string' ||
        !Number.isInteger(protocolVersion)
      ) {
        return { kind: 'error' }
      }
      try {
        await props.onSave({ authToken, endpoint, protocolVersion })
        return { kind: 'saved' }
      } catch {
        return { kind: 'error' }
      }
    },
    { kind: 'idle' }
  )

  return (
    <main className="bg-background text-foreground min-h-dvh p-6">
      <section className="border-border bg-card mx-auto max-w-xl border p-5">
        <h1 className="text-lg font-semibold">
          {translate('extension.settings.daemon', 'Daemon connection')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {translate(
            'extension.settings.description',
            'Leave these fields empty to use the local daemon through Native Messaging. Remote addresses are stored with Chrome sync; access tokens last only for this browser session.'
          )}
        </p>
        <form action={saveAction} className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.endpoint', 'WebSocket endpoint')}</span>
            <Input
              name="endpoint"
              defaultValue={props.initialSettings.endpoint}
              placeholder={translate(
                'extension.settings.endpointPlaceholder',
                'wss://host.example/rpc'
              )}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.token', 'Access token')}</span>
            <Input
              name="auth-token"
              type="password"
              defaultValue={props.initialSettings.authToken}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.protocolVersion', 'Protocol version')}</span>
            <Input
              name="protocol-version"
              inputMode="numeric"
              defaultValue={String(props.initialSettings.protocolVersion)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {translate('extension.settings.save', 'Save connection')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void props.onReset().then(() => location.reload())}
            >
              {translate('extension.settings.useLocal', 'Use local daemon')}
            </Button>
          </div>
        </form>
        {state.kind === 'saved' ? (
          <p className="text-muted-foreground mt-3 text-sm">
            {translate('extension.settings.saved', 'Saved. Reopen Yiru pages to use this daemon.')}
          </p>
        ) : null}
        {state.kind === 'error' ? (
          <p className="text-destructive mt-3 text-sm">
            {translate(
              'extension.settings.invalid',
              'Enter a ws:// or wss:// endpoint, a token, and a positive protocol version.'
            )}
          </p>
        ) : null}
      </section>
      <section className="border-border bg-card mx-auto mt-4 max-w-xl border p-5">
        <h2 className="text-base font-semibold">
          {translate('extension.settings.siteTrust', 'Trusted browser sites')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {translate(
            'extension.settings.siteTrustDescription',
            'These origins may be read without another prompt. Removing one does not affect one-time tab access.'
          )}
        </p>
        {props.initialTrustedSites.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            {translate('extension.settings.noTrustedSites', 'No sites are always allowed.')}
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {props.initialTrustedSites.map((origin) => (
              <div key={origin} className="border-border flex items-center gap-3 border p-2">
                <span className="min-w-0 flex-1 truncate text-sm">{origin}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void props.onRevokeSite(origin).then(() => location.reload())}
                >
                  {translate('extension.settings.revokeSite', 'Remove')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
      <CommunityAdaptersSettings
        communityAdaptersDisabled={props.communityAdaptersDisabled}
        initialCommunityAdapters={props.initialCommunityAdapters}
        onOpenUserScriptsSettings={props.onOpenUserScriptsSettings}
        onRemoveCommunityAdapter={props.onRemoveCommunityAdapter}
        onSaveCommunityAdapter={props.onSaveCommunityAdapter}
      />
    </main>
  )
}
