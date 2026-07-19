import type * as monaco from 'monaco-editor'
import { useAppStore } from '@/store'

export type LanguageServerWorkspaceEditTarget = {
  filePath: string
  relativePath: string
  before: string
  after: string
  editCount: number
  isOpen: boolean
  isDirty: boolean
  model: monaco.editor.ITextModel | null
  modelVersion: number | null
  openFileId: string | null
  readText: () => Promise<string>
  writeText: (content: string) => Promise<void>
}

export async function applyLanguageServerWorkspaceEdit(
  files: LanguageServerWorkspaceEditTarget[]
): Promise<void> {
  await revalidatePlan(files)
  const diskFiles = files.filter((file) => !file.model)
  const modelFiles = files.filter((file) => file.model)
  const written: LanguageServerWorkspaceEditTarget[] = []
  const changedModels: LanguageServerWorkspaceEditTarget[] = []
  try {
    for (const file of diskFiles) {
      if ((await file.readText()) !== file.before) {
        throw new Error(`File changed while applying edits: ${file.relativePath}`)
      }
      await file.writeText(file.after)
      written.push(file)
    }
    for (const file of modelFiles) {
      const model = file.model
      if (!model) {
        continue
      }
      assertModelUnchanged(file, model)
      model.pushStackElement()
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: file.after }],
        () => null
      )
      model.pushStackElement()
      changedModels.push(file)
      updateOpenFileState(file, file.after, file.after === file.before ? file.isDirty : true)
    }
  } catch (error) {
    const rollbackFailures: string[] = []
    for (const file of changedModels.toReversed()) {
      try {
        file.model?.undo()
        updateOpenFileState(file, file.before, file.isDirty, true)
      } catch {
        rollbackFailures.push(file.relativePath)
      }
    }
    rollbackFailures.push(...(await rollbackDiskFiles(written)))
    if (rollbackFailures.length > 0) {
      throw new Error(
        `Workspace edit failed; rollback also failed for ${rollbackFailures.join(', ')}`
      )
    }
    throw error
  }
}

async function revalidatePlan(files: LanguageServerWorkspaceEditTarget[]): Promise<void> {
  for (const file of files) {
    if (file.model) {
      assertOpenFileStillWritable(file)
      if (
        file.model.isDisposed() ||
        file.model.getVersionId() !== file.modelVersion ||
        file.model.getValue() !== file.before
      ) {
        throw new Error(`Editor content changed while previewing: ${file.relativePath}`)
      }
    } else if ((await file.readText()) !== file.before) {
      throw new Error(`File changed on disk while previewing: ${file.relativePath}`)
    }
  }
}

function assertOpenFileStillWritable(file: LanguageServerWorkspaceEditTarget): void {
  const openFile = useAppStore
    .getState()
    .openFiles.find((candidate) => candidate.id === file.openFileId)
  if (
    !openFile ||
    openFile.readOnly ||
    openFile.mode !== 'edit' ||
    openFile.externalMutation ||
    openFile.pendingDiskBaselineVerification ||
    openFile.conflict?.conflictStatus === 'unresolved'
  ) {
    throw new Error(`Editor state changed while previewing: ${file.relativePath}`)
  }
}

async function rollbackDiskFiles(files: LanguageServerWorkspaceEditTarget[]): Promise<string[]> {
  const failures: string[] = []
  for (const file of files.toReversed()) {
    try {
      // Why: never overwrite a third-party write that raced with our failed transaction.
      if ((await file.readText()) !== file.after) {
        throw new Error('File changed after workspace edit write.')
      }
      await file.writeText(file.before)
    } catch {
      failures.push(file.relativePath)
    }
  }
  return failures
}

function assertModelUnchanged(
  file: LanguageServerWorkspaceEditTarget,
  model: monaco.editor.ITextModel
): void {
  assertOpenFileStillWritable(file)
  if (
    model.isDisposed() ||
    model.getVersionId() !== file.modelVersion ||
    model.getValue() !== file.before
  ) {
    throw new Error(`Editor content changed while applying edits: ${file.relativePath}`)
  }
}

function updateOpenFileState(
  file: LanguageServerWorkspaceEditTarget,
  content: string,
  dirty: boolean,
  forceDirty = false
): void {
  if (!file.openFileId) {
    return
  }
  const state = useAppStore.getState()
  const current = state.openFiles.find((candidate) => candidate.id === file.openFileId)
  state.setEditorDraft(file.openFileId, content)
  // Why: the mounted editor computes dirty against its real baseline. Only
  // supply a fallback when that synchronous listener did not update the bit.
  if (forceDirty || current?.isDirty === file.isDirty) {
    state.markFileDirty(file.openFileId, dirty)
  }
}

export function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
