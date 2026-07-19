import type { OpenFile } from '@/store/slices/editor'
import { useAppStore } from '@/store'
import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import type {
  LspResourceOperation,
  LspTextDocumentEdit,
  LspTextEdit,
  LspWorkspaceEdit
} from './language-server-protocol'
import type { MonacoLanguageServerSession } from './monaco-language-server-session'
import { applyLanguageServerTextEdits } from './language-server-text-edits'
import {
  applyLanguageServerWorkspaceEdit,
  utf8Size,
  type LanguageServerWorkspaceEditTarget
} from './language-server-workspace-edit-apply'

const MAX_EDIT_FILES = 50
const MAX_TEXT_EDITS = 1_000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 5 * 1024 * 1024

type PendingDocumentEdit = {
  uri: string
  version: number | null
  edits: LspTextEdit[]
}

export type LanguageServerWorkspaceEditPreviewFile = {
  filePath: string
  relativePath: string
  before: string
  after: string
  editCount: number
  isOpen: boolean
  isDirty: boolean
}

export type LanguageServerWorkspaceEditPlan = {
  title: string
  files: LanguageServerWorkspaceEditPreviewFile[]
  apply: () => Promise<void>
}

export async function createLanguageServerWorkspaceEditPlan(
  session: MonacoLanguageServerSession,
  workspaceEdit: LspWorkspaceEdit,
  title: string
): Promise<LanguageServerWorkspaceEditPlan> {
  const pending = normalizeWorkspaceEdit(workspaceEdit)
  if (pending.length === 0) {
    throw new Error('The language server returned no text edits.')
  }
  const grouped = await resolveAndGroupEdits(session, pending)
  const files: LanguageServerWorkspaceEditTarget[] = []
  let totalBytes = 0
  for (const group of grouped.values()) {
    const file = await planFile(session, group)
    totalBytes += utf8Size(file.before) + utf8Size(file.after)
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('The language server edit is too large to preview safely.')
    }
    files.push(file)
  }
  return {
    title,
    files,
    apply: () => applyLanguageServerWorkspaceEdit(files)
  }
}

function normalizeWorkspaceEdit(workspaceEdit: LspWorkspaceEdit): PendingDocumentEdit[] {
  if (!workspaceEdit || typeof workspaceEdit !== 'object') {
    throw new Error('The language server returned an invalid workspace edit.')
  }
  const hasChanges = workspaceEdit.changes && Object.keys(workspaceEdit.changes).length > 0
  const hasDocumentChanges =
    Array.isArray(workspaceEdit.documentChanges) && workspaceEdit.documentChanges.length > 0
  if (hasChanges && hasDocumentChanges) {
    throw new Error('Workspace edits cannot mix changes and documentChanges.')
  }
  const pending: PendingDocumentEdit[] = []
  if (hasDocumentChanges) {
    for (const change of workspaceEdit.documentChanges ?? []) {
      if (isResourceOperation(change)) {
        throw new Error('File create, rename, and delete operations are not supported yet.')
      }
      if (!isTextDocumentEdit(change)) {
        throw new Error('The language server returned an invalid document edit.')
      }
      pending.push({
        uri: change.textDocument.uri,
        version: change.textDocument.version,
        edits: change.edits
      })
    }
  } else {
    for (const [uri, edits] of Object.entries(workspaceEdit.changes ?? {})) {
      if (!Array.isArray(edits)) {
        throw new Error('The language server returned an invalid changes map.')
      }
      pending.push({ uri, version: null, edits })
    }
  }
  const editCount = pending.reduce((count, item) => count + item.edits.length, 0)
  if (pending.length > MAX_EDIT_FILES || editCount > MAX_TEXT_EDITS) {
    throw new Error('The language server edit exceeds Yiru’s safety limits.')
  }
  return pending
}

async function resolveAndGroupEdits(
  session: MonacoLanguageServerSession,
  pending: PendingDocumentEdit[]
): Promise<Map<string, PendingDocumentEdit & { filePath: string; relativePath: string }>> {
  const grouped = new Map<
    string,
    PendingDocumentEdit & { filePath: string; relativePath: string }
  >()
  for (const item of pending) {
    // Why: server-returned URIs are untrusted until the owning host canonicalizes
    // them and proves they stay inside this session's workspace.
    const location = await session.resolveLocation(item.uri)
    const key = normalizeRuntimePathForComparison(location.filePath)
    const existing = grouped.get(key)
    if (existing) {
      if (existing.version !== null && item.version !== null && existing.version !== item.version) {
        throw new Error('The language server returned conflicting document versions.')
      }
      existing.version ??= item.version
      existing.edits.push(...item.edits)
    } else {
      grouped.set(key, { ...item, ...location, edits: [...item.edits] })
    }
  }
  return grouped
}

async function planFile(
  session: MonacoLanguageServerSession,
  group: PendingDocumentEdit & { filePath: string; relativePath: string }
): Promise<LanguageServerWorkspaceEditTarget> {
  const state = useAppStore.getState()
  const openFiles = state.openFiles.filter(
    (file) =>
      file.worktreeId === session.getWorktreeId() &&
      (file.runtimeEnvironmentId?.trim() || null) === session.getRuntimeEnvironmentId() &&
      normalizeRuntimePathForComparison(file.filePath) ===
        normalizeRuntimePathForComparison(group.filePath)
  )
  assertOpenFilesCanChange(openFiles)
  const openFile = openFiles[0] ?? null
  const sessionModel = session.getDocumentModel(group.uri, group.filePath)
  const model = openFile && sessionModel && !sessionModel.isDisposed() ? sessionModel : null
  if (openFile && !model) {
    throw new Error(`Open file is not synchronized with the language server: ${group.relativePath}`)
  }
  if (group.version !== null && (!model || model.getVersionId() !== group.version)) {
    throw new Error(`Document version changed before the edit: ${group.relativePath}`)
  }
  const before = model
    ? model.getValue()
    : await session.readWorkspaceTextFile(group.filePath, group.relativePath)
  if (utf8Size(before) > MAX_FILE_BYTES) {
    throw new Error(`File is too large to edit safely: ${group.relativePath}`)
  }
  const after = applyLanguageServerTextEdits(before, group.edits)
  return {
    filePath: group.filePath,
    relativePath: group.relativePath,
    before,
    after,
    editCount: group.edits.length,
    isOpen: openFile !== null,
    isDirty: openFile?.isDirty === true,
    model,
    modelVersion: model?.getVersionId() ?? null,
    openFileId: openFile?.id ?? null,
    readText: () => session.readWorkspaceTextFile(group.filePath, group.relativePath),
    writeText: (content) => session.writeWorkspaceTextFile(group.filePath, content)
  }
}

function assertOpenFilesCanChange(openFiles: OpenFile[]): void {
  if (openFiles.length > 1) {
    throw new Error('The same workspace-edit file is open in multiple editor tabs.')
  }
  const file = openFiles[0]
  if (!file) {
    return
  }
  if (file.readOnly || file.mode !== 'edit') {
    throw new Error(`Cannot edit read-only tab: ${file.relativePath}`)
  }
  if (
    file.externalMutation ||
    file.pendingDiskBaselineVerification ||
    file.conflict?.conflictStatus === 'unresolved'
  ) {
    throw new Error(`Resolve the existing file conflict first: ${file.relativePath}`)
  }
}

function isResourceOperation(
  change: LspTextDocumentEdit | LspResourceOperation
): change is LspResourceOperation {
  return Boolean(change && typeof change === 'object' && 'kind' in change)
}

function isTextDocumentEdit(value: unknown): value is LspTextDocumentEdit {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<LspTextDocumentEdit>
  return (
    typeof candidate.textDocument?.uri === 'string' &&
    (candidate.textDocument.version === null || Number.isInteger(candidate.textDocument.version)) &&
    Array.isArray(candidate.edits)
  )
}
