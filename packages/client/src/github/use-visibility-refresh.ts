import { useEffect } from 'react'

import { useAppStore } from '../store/state'

export function useGitHubVisibilityRefresh(): void {
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      const state = useAppStore.getState()
      if (document.visibilityState === 'visible') {
        state.refreshAllGitHub()
        state.bumpGitHubPRVisibleRefreshGeneration()
      } else {
        state.reportVisibleGitHubPRRefreshCandidates([], Date.now())
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])
}
