import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import { NewWorkspaceModal } from './new-workspace-modal'

export type NewWorkspaceModalControllerHandle = {
  open: () => void
}

type Props = {
  routeVisible: boolean
  client: RpcClient | null
  hostId?: string
  hostCapabilities?: readonly string[]
  existingWorktreePaths?: readonly string[]
  existingWorktrees?: readonly { repoId: string; branch: string }[]
  onVisibleChange?: (visible: boolean) => void
  onRouteVisibleChange: (visible: boolean) => void
  onCreated: (worktreeId: string, name: string) => void
}

export const NewWorkspaceModalController = forwardRef<NewWorkspaceModalControllerHandle, Props>(
  function NewWorkspaceModalController(
    {
      routeVisible,
      client,
      hostId,
      hostCapabilities,
      existingWorktreePaths,
      existingWorktrees,
      onVisibleChange,
      onRouteVisibleChange,
      onCreated
    },
    ref
  ) {
    const [manualVisible, setManualVisible] = useState(false)
    const visible = routeVisible || manualVisible

    useImperativeHandle(
      ref,
      () => ({
        open: () => setManualVisible(true)
      }),
      []
    )

    const close = useCallback(() => {
      setManualVisible(false)
      if (routeVisible) {
        onRouteVisibleChange(false)
      }
    }, [onRouteVisibleChange, routeVisible])

    useEffect(() => {
      onVisibleChange?.(visible)
    }, [onVisibleChange, visible])

    return (
      <NewWorkspaceModal
        visible={visible}
        client={client}
        hostId={hostId}
        hostCapabilities={hostCapabilities}
        existingWorktreePaths={existingWorktreePaths}
        existingWorktrees={existingWorktrees}
        onCreated={onCreated}
        onClose={close}
      />
    )
  }
)
