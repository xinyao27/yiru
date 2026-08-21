import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'

type WebRuntimeConnectionPageProps = {
  environmentName: string
  state: 'checking' | 'offline'
  onRetry: () => void
  onPairAnother: () => void
}

export function WebRuntimeConnectionPage(props: WebRuntimeConnectionPageProps): React.JSX.Element {
  const isChecking = props.state === 'checking'
  const title = isChecking
    ? translate('auto.web.WebRuntimeConnectionPage.checkingTitle', 'Connecting to {{machine}}', {
        machine: props.environmentName
      })
    : translate('auto.web.WebRuntimeConnectionPage.offlineTitle', '{{machine}} is offline', {
        machine: props.environmentName
      })

  return (
    <main className="bg-background text-foreground min-h-dvh px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="border-border border-b pb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-3 max-w-[620px] text-sm leading-6">
            {isChecking
              ? translate(
                  'auto.web.WebRuntimeConnectionPage.checkingDescription',
                  'Yiru is checking the saved private connection before opening your projects.'
                )
              : translate(
                  'auto.web.WebRuntimeConnectionPage.offlineDescription',
                  'Start Yiru or its connect command on that computer. This page will reconnect automatically when the runtime is available.'
                )}
          </p>
        </header>

        <section aria-live="polite" className="flex flex-col items-start gap-4">
          {isChecking ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoadingIndicator className="size-4" aria-hidden="true" />
              {translate(
                'auto.web.WebRuntimeConnectionPage.checkingStatus',
                'Checking runtime status…'
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm leading-6">
              {translate(
                'auto.web.WebRuntimeConnectionPage.savedPairing',
                'Your pairing is still saved in this browser; no new pairing command is needed.'
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!isChecking && (
              <Button type="button" onClick={props.onRetry}>
                {translate('auto.web.WebRuntimeConnectionPage.retry', 'Try again')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={props.onPairAnother}>
              {translate('auto.web.WebRuntimeConnectionPage.pairAnother', 'Pair another computer')}
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
