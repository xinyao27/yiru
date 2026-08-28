import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

import { extensionOrpc } from '../runtime/orpc'

export function DaemonUpdateCard(): React.JSX.Element {
  const queryClient = useQueryClient()
  const statusQuery = extensionOrpc.update.check.queryOptions({
    input: {},
    staleTime: 6 * 60 * 60_000
  })
  const status = useQuery(statusQuery)
  const check = useMutation({
    mutationFn: async () => extensionOrpc.update.check.call({ force: true }),
    onSuccess: (result) => queryClient.setQueryData(statusQuery.queryKey, result)
  })
  const value = check.data ?? status.data
  return (
    <section className="border-border mt-5 border p-4">
      <h2 className="font-medium">
        {translate('extension.automations.daemonUpdate', 'Daemon update')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {value
          ? translate(
              'extension.automations.daemonVersion',
              'Installed {{current}} · latest {{latest}}',
              { current: value.currentVersion, latest: value.latestVersion ?? 'unknown' }
            )
          : translate('extension.automations.updateNotChecked', 'Update status has not loaded.')}
      </p>
      {value?.updateAvailable ? (
        <div className="mt-3">
          <p className="text-sm">
            {translate(
              'extension.automations.updateAvailable',
              'Update available. Run this trusted installer command in a terminal:'
            )}
          </p>
          <pre className="bg-muted mt-2 overflow-x-auto p-2 text-xs">{value.installCommand}</pre>
        </div>
      ) : null}
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="mt-3"
        disabled={check.isPending}
        onClick={() => check.mutate()}
      >
        {translate('extension.automations.checkUpdate', 'Check now')}
      </Button>
      {check.isError || status.isError ? (
        <p className="text-destructive mt-2 text-sm">
          {translate(
            'extension.automations.updateCheckFailed',
            'The release service could not be reached. Your daemon keeps running unchanged.'
          )}
        </p>
      ) : null}
    </section>
  )
}
