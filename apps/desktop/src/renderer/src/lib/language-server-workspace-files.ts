import {
  clearSelfWrite,
  getEditorSelfWriteHostId,
  recordSelfWrite,
  SELF_WRITE_REMOTE_TTL_MS
} from '@/components/editor/editor-self-write-registry'
import { readRuntimeFileContent, writeRuntimeFile } from '@/runtime/runtime-file-client'

import { splitWorktreeIdForFilesystem } from '../../../shared/worktree-id'

export class LanguageServerWorkspaceFiles {
  constructor(
    private readonly worktreeId: string,
    private readonly runtimeEnvironmentId: string | null | undefined,
    private readonly connectionId: string | null | undefined
  ) {}

  async readText(filePath: string, relativePath: string): Promise<string> {
    const result = await readRuntimeFileContent({
      settings: { activeRuntimeEnvironmentId: this.runtimeEnvironmentId ?? null },
      filePath,
      relativePath,
      worktreeId: this.worktreeId,
      connectionId: this.connectionId ?? undefined
    })
    if (result.isBinary) {
      throw new Error('Language server workspace edits cannot modify binary files.')
    }
    return result.content
  }

  async writeText(filePath: string, content: string): Promise<void> {
    const worktreePath = splitWorktreeIdForFilesystem(this.worktreeId)?.worktreePath ?? null
    const remote = Boolean(this.connectionId || this.runtimeEnvironmentId?.trim())
    const selfWriteHostId = getEditorSelfWriteHostId(this.runtimeEnvironmentId, this.connectionId)
    recordSelfWrite(
      filePath,
      content,
      selfWriteHostId,
      remote ? SELF_WRITE_REMOTE_TTL_MS : undefined
    )
    try {
      await writeRuntimeFile(
        {
          settings: { activeRuntimeEnvironmentId: this.runtimeEnvironmentId ?? null },
          worktreeId: this.worktreeId,
          worktreePath,
          connectionId: this.connectionId ?? undefined
        },
        filePath,
        content
      )
    } catch (error) {
      clearSelfWrite(filePath, selfWriteHostId)
      throw error
    }
  }
}
