import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Globe, StopCircle } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

import { getExtensionBrowserCapabilities, type NetworkMockMode } from '../browser-capabilities'

export function NetworkMock({ pageUrl }: { pageUrl: string }): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const [urlIncludes, setUrlIncludes] = useState('/api/')
  const statusKey = ['extension-host', 'network-mock-status', pageUrl] as const
  const status = useQuery({
    queryKey: statusKey,
    queryFn: capabilities.isNetworkMockActive,
    refetchInterval: 1_000
  })
  const apply = useMutation({
    mutationFn: async (mode: NetworkMockMode) => {
      const granted = await capabilities.hasBrowserControlAccess()
      if (!granted) {
        throw new Error('browser_control_unavailable')
      }
      await capabilities.startNetworkMock({ mode, urlIncludes })
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: statusKey })
  })
  const stop = useMutation({
    mutationFn: capabilities.stopNetworkMock,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: statusKey })
  })
  const error = apply.error ?? stop.error

  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <div className="flex items-center gap-1">
        <Globe className="text-muted-foreground size-3.5" />
        <Input
          value={urlIncludes}
          onChange={(event) => setUrlIncludes(event.target.value)}
          aria-label={translate('extension.networkMock.pattern', 'Request URL contains')}
          placeholder="/api/"
          disabled={status.data}
          className="h-7 text-xs"
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {status.data ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={stop.isPending}
            onClick={() => stop.mutate()}
          >
            <StopCircle />
            {translate('extension.networkMock.stop', 'Stop mock')}
          </Button>
        ) : (
          <>
            <MockButton mode="error-500" label="500" apply={apply.mutate} />
            <MockButton
              mode="empty"
              label={translate('extension.networkMock.empty', 'Empty')}
              apply={apply.mutate}
            />
            <MockButton
              mode="slow"
              label={translate('extension.networkMock.slow', 'Slow')}
              apply={apply.mutate}
            />
          </>
        )}
      </div>
      {error ? (
        <p className="text-destructive pt-1 text-xs">
          {translate('extension.networkMock.failed', 'The network simulation could not start.')}
        </p>
      ) : null}
    </div>
  )
}

function MockButton({
  apply,
  label,
  mode
}: {
  apply: (mode: NetworkMockMode) => void
  label: string
  mode: NetworkMockMode
}): React.JSX.Element {
  return (
    <Button type="button" size="xs" variant="outline" onClick={() => apply(mode)}>
      {label}
    </Button>
  )
}
