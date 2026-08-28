import { useEffect } from 'react'
import { getLocalPreflightContext, localPreflightContextKey } from '~renderer/preflight/context'
import { useAppStore } from '~renderer/store/state'

export function useIntegrationProviderStatusRefresh(): void {
  const preflightStatusChecked = useAppStore((s) => s.preflightStatusChecked)
  const preflightStatusContextKey = useAppStore((s) => s.preflightStatusContextKey)
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)
  const expectedPreflightContextKey = useAppStore((s) =>
    localPreflightContextKey(getLocalPreflightContext(s))
  )

  useEffect(() => {
    if (preflightStatusContextKey !== expectedPreflightContextKey || !preflightStatusChecked) {
      void refreshPreflightStatus()
    }
  }, [
    expectedPreflightContextKey,
    preflightStatusChecked,
    preflightStatusContextKey,
    refreshPreflightStatus
  ])
}
