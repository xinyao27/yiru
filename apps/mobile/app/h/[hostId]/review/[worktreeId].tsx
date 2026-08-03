import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'

import { MobileDiffReviewScreenView } from '~/review/screen-view'
import { normalizeReviewAreaParam } from '~/session/diff/review-positioning'
import { firstReviewParam, normalizeReviewFilterParam } from '~/session/diff/review-screen-model'
import { useMobileDiffReviewController } from '~/session/diff/use-review-controller'
import { useForceReconnect, useHostClient } from '~/transport/client-context'

export default function MobileDiffReviewScreen() {
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    worktreeId?: string | string[]
    name?: string | string[]
    scope?: string | string[]
    file?: string | string[]
    area?: string | string[]
  }>()
  const hostId = firstReviewParam(params.hostId)
  const worktreeId = firstReviewParam(params.worktreeId)
  const name = firstReviewParam(params.name)
  const initialFilter = normalizeReviewFilterParam(firstReviewParam(params.scope))
  const initialFile = firstReviewParam(params.file)
  const initialArea = normalizeReviewAreaParam(firstReviewParam(params.area))
  const initialTarget = useMemo(
    () => (initialFile && initialArea ? { filePath: initialFile, area: initialArea } : null),
    [initialArea, initialFile]
  )
  const router = useRouter()
  const { client, state: connState } = useHostClient(hostId)
  const forceReconnect = useForceReconnect()

  const openSession = useCallback(() => {
    const query = name ? `?${new URLSearchParams({ name }).toString()}` : ''
    router.replace(
      `/h/${encodeURIComponent(hostId)}/session/${encodeURIComponent(worktreeId)}${query}`
    )
  }, [hostId, name, router, worktreeId])

  const controller = useMobileDiffReviewController({
    client,
    connState,
    hostId,
    worktreeId,
    name,
    initialFilter,
    initialTarget,
    onOpenSession: openSession,
    onReconnect: forceReconnect
  })

  return <MobileDiffReviewScreenView controller={controller} />
}
