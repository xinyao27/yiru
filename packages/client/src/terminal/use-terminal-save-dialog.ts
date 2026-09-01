import { useState } from 'react'
import {
  YIRU_EDITOR_SAVE_AND_CLOSE_EVENT,
  requestEditorSaveQuiesce
} from '~renderer/editor/autosave'
import type { OpenFile } from '~renderer/editor/state'

type UseTerminalSaveDialogParams = {
  openFiles: OpenFile[]
  closeFile: (fileId: string) => void
  markFileDirty: (fileId: string, dirty: boolean) => void
}

type UseTerminalSaveDialogResult = {
  saveDialogFileId: string | null
  saveDialogFile: OpenFile | null
  requestCloseFile: (fileId: string) => void
  handleSaveDialogSave: () => void
  handleSaveDialogDiscard: () => void
  handleSaveDialogCancel: () => void
}

export function useTerminalSaveDialog({
  openFiles,
  closeFile,
  markFileDirty
}: UseTerminalSaveDialogParams): UseTerminalSaveDialogResult {
  const [saveDialogFileId, setSaveDialogFileId] = useState<string | null>(null)

  const saveDialogFile = saveDialogFileId
    ? (openFiles.find((f) => f.id === saveDialogFileId) ?? null)
    : null

  const requestCloseFile = (fileId: string) => {
    const file = openFiles.find((openFile) => openFile.id === fileId)
    if (file?.isDirty) {
      setSaveDialogFileId(fileId)
      return
    }
    closeFile(fileId)
  }

  const handleSaveDialogSave = () => {
    if (!saveDialogFileId) {
      return
    }

    window.dispatchEvent(
      new CustomEvent(YIRU_EDITOR_SAVE_AND_CLOSE_EVENT, { detail: { fileId: saveDialogFileId } })
    )
    setSaveDialogFileId(null)
  }

  const handleSaveDialogDiscard = async () => {
    if (!saveDialogFileId) {
      return
    }

    // Why: "Don't Save" must win over any pending autosave write for the same
    // tab, even if the editor is currently waiting on a background debounce.
    await requestEditorSaveQuiesce({ fileId: saveDialogFileId })
    markFileDirty(saveDialogFileId, false)
    closeFile(saveDialogFileId)
    setSaveDialogFileId(null)
  }

  const handleSaveDialogCancel = () => {
    setSaveDialogFileId(null)
  }

  return {
    saveDialogFileId,
    saveDialogFile,
    requestCloseFile,
    handleSaveDialogSave,
    handleSaveDialogDiscard,
    handleSaveDialogCancel
  }
}
