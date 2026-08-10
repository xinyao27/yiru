import { useCallback, useEffect } from 'react'
import { shellClient } from '~renderer/runtime/shell-client'
import { NATIVE_FILE_DROP_TARGET } from '~shared/native-file-drop'

export function useNativeChatFileAttachmentActions(
  attachExternalPaths: (paths: string[]) => void
): { pickAttachment: () => void } {
  useEffect(
    () =>
      shellClient.ui.onFileDrop((payload) => {
        if (payload.target === NATIVE_FILE_DROP_TARGET.composer) {
          attachExternalPaths(payload.paths)
        }
      }),
    [attachExternalPaths]
  )

  const pickAttachment = useCallback(() => {
    void (async () => {
      const filePath = await shellClient.shell.pickAttachment()
      if (filePath) {
        attachExternalPaths([filePath])
      }
    })()
  }, [attachExternalPaths])

  return { pickAttachment }
}
