import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { NATIVE_FILE_DROP_TARGET, hasNativeFileDragTypes } from '~renderer/native-file-drop'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store/state'

import {
  getSidebarProjectDropAffordance,
  isRemoteRuntimeActive,
  resolveSidebarProjectDropPath
} from './project-drop'

type SidebarProjectDropHandlers = {
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void
  onDragOver: (event: React.DragEvent<HTMLElement>) => void
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void
}

export function useSidebarProjectDrop(): {
  nativeDropTarget: typeof NATIVE_FILE_DROP_TARGET.projectSidebar
  dropHandlers: SidebarProjectDropHandlers
  affordance: ReturnType<typeof getSidebarProjectDropAffordance>
} {
  const openModal = useAppStore((s) => s.openModal)
  const settings = useAppStore((s) => s.settings)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isHandlingDrop, setIsHandlingDrop] = useState(false)
  const dragDepthRef = useRef(0)
  const remoteRuntimeActive = isRemoteRuntimeActive(settings)
  const mountedRef = useMountedRef()

  const clearDragState = useEventCallback(() => {
    dragDepthRef.current = 0
    setIsDragOver(false)
  })

  useEffect(() => {
    document.addEventListener('drop', clearDragState, true)
    document.addEventListener('dragend', clearDragState, true)
    return () => {
      document.removeEventListener('drop', clearDragState, true)
      document.removeEventListener('dragend', clearDragState, true)
    }
  }, [clearDragState])

  const handleProjectDropPaths = useEventCallback(async (paths: readonly string[]) => {
    const pathResolution = resolveSidebarProjectDropPath(paths)
    if (pathResolution.status === 'empty') {
      return
    }
    if (pathResolution.status === 'multiple') {
      toast.warning(
        translate(
          'auto.components.sidebar.useSidebarProjectDrop.c0315153d1',
          'Drop one folder at a time.'
        )
      )
      return
    }
    if (remoteRuntimeActive) {
      toast.error(
        translate(
          'auto.components.sidebar.useSidebarProjectDrop.849ef13dc0',
          'Local folder drops are unavailable for runtime hosts.'
        ),
        {
          description: translate(
            'auto.components.sidebar.useSidebarProjectDrop.5ccb56c7be',
            'Use Add Project to enter a host path.'
          )
        }
      )
      return
    }

    setIsHandlingDrop(true)
    try {
      await workspaceHostClient.fileHost.authorizeExternalPath({
        targetPath: pathResolution.path
      })
      const stat = await workspaceHostClient.fileHost.stat({ filePath: pathResolution.path })
      if (!mountedRef.current) {
        return
      }
      if (!stat.isDirectory) {
        toast.error(
          translate(
            'auto.components.sidebar.useSidebarProjectDrop.451a4638db',
            'Drop a folder to add it as a project.'
          )
        )
        return
      }
      openModal('add-repo', { droppedLocalPath: pathResolution.path })
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.sidebar.useSidebarProjectDrop.f34a286c0d',
            'Could not add dropped folder.'
          ),
          {
            description: error instanceof Error ? error.message : String(error)
          }
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsHandlingDrop(false)
      }
    }
  })

  useEffect(() => {
    return shellClient.ui.onFileDrop((data) => {
      if (data.target !== NATIVE_FILE_DROP_TARGET.projectSidebar) {
        return
      }
      void handleProjectDropPaths(data.paths)
    })
  }, [handleProjectDropPaths])

  const dropHandlers: SidebarProjectDropHandlers = {
    onDragEnter: (event) => {
      if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
        return
      }
      dragDepthRef.current += 1
      setIsDragOver(true)
    },
    onDragOver: (event) => {
      if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = remoteRuntimeActive ? 'none' : 'copy'
      setIsDragOver(true)
    },
    onDragLeave: (event) => {
      if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
        return
      }
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragOver(false)
      }
    }
  }

  return {
    nativeDropTarget: NATIVE_FILE_DROP_TARGET.projectSidebar,
    dropHandlers,
    affordance: getSidebarProjectDropAffordance({
      isDragOver,
      isHandlingDrop,
      remoteRuntimeActive
    })
  }
}
