export const YIRU_EDITOR_SAVE_DIRTY_FILES_EVENT = 'yiru:editor-save-dirty-files'
export const YIRU_EDITOR_PREPARE_HOT_EXIT_EVENT = 'yiru:editor-prepare-hot-exit'

export type EditorSaveDirtyFilesDetail = {
  claim: () => void
  resolve: () => void
  reject: (message: string) => void
}

export type EditorPrepareHotExitDetail = EditorSaveDirtyFilesDetail
