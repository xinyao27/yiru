import type { ErrorComponentProps } from '@tanstack/react-router'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

export function RuntimeRoutePending(): React.JSX.Element {
  return (
    <main className="bg-background text-muted-foreground grid h-dvh place-items-center p-8 text-sm">
      <p role="status">{translate('extension.route.loading', 'Opening Yiru…')}</p>
    </main>
  )
}

export function RuntimeRouteError({ reset }: ErrorComponentProps): React.JSX.Element {
  return (
    <main className="bg-background text-foreground grid h-dvh place-items-center p-8">
      <section className="border-border bg-card max-w-sm border p-5">
        <h1 className="text-base font-semibold">
          {translate('extension.route.failed', 'This Yiru view could not be displayed')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {translate(
            'extension.route.failedDescription',
            'Your daemon sessions are still running. Retry this view after the connection settles.'
          )}
        </p>
        <Button type="button" className="mt-4" onClick={reset}>
          {translate('extension.route.retry', 'Retry view')}
        </Button>
      </section>
    </main>
  )
}
