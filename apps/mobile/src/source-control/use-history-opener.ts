import type { useRouter } from 'expo-router'
import { useCallback } from 'react'

export function useMobileSourceControlHistoryOpener({
  hostId,
  worktreeId,
  router,
  setShowActionSheet,
  onOpenHistory
}: {
  hostId: string
  worktreeId: string
  router: ReturnType<typeof useRouter>
  setShowActionSheet: (next: boolean) => void
  onOpenHistory?: () => void
}): () => void {
  return useCallback(() => {
    setShowActionSheet(false)
    // Why: the hub owns History as a segment; standalone entry falls back to
    // the hub route directly so deep links do not bounce through a redirect.
    if (onOpenHistory) {
      onOpenHistory()
      return
    }
    if (hostId && worktreeId) {
      router.push({
        pathname: '/h/[hostId]/source-control/[worktreeId]',
        params: { hostId, worktreeId, tab: 'history' }
      } as Parameters<typeof router.push>[0])
    }
  }, [hostId, onOpenHistory, router, setShowActionSheet, worktreeId])
}
