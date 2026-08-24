import type {
  CreateWorktreeResult,
  Worktree,
  WorktreeLineage,
  WorkspaceLineage,
  WorktreeLineageWarning
} from '~shared/types'
import { worktreeWorkspaceKey } from '~shared/workspace/scope'

import { BRACKETED_PASTE_BEGIN, BRACKETED_PASTE_END } from '../model/terminal-startup'
import type { WorktreeStartupDraftPaste, WorktreeStartupFollowup } from '../model/terminal-startup'
import type { WorktreeLineageResolution } from '../model/worktree-resolution'
import { RuntimeWorktreeBuildStartupForDraft } from './build-startup-for-draft'

export abstract class RuntimeWorktreeRecordCreatedWorktreeLineage extends RuntimeWorktreeBuildStartupForDraft {
  protected recordCreatedWorktreeLineage(
    worktree: Pick<Worktree, 'id' | 'instanceId'>,
    lineageResolution: WorktreeLineageResolution
  ): {
    lineage: WorktreeLineage | null
    workspaceLineage: WorkspaceLineage | null
    warnings: WorktreeLineageWarning[]
  } {
    const warnings = lineageResolution.kind === 'none' ? [...lineageResolution.warnings] : []
    let lineage: WorktreeLineage | null = null
    let workspaceLineage: WorkspaceLineage | null = null
    if (lineageResolution.kind !== 'lineage') {
      return { lineage, workspaceLineage, warnings }
    }

    const childInstanceId = worktree.instanceId
    const parentInstanceId = lineageResolution.parent.instanceId
    const createdAt = Date.now()
    if (
      lineageResolution.parent.type === 'worktree' &&
      childInstanceId &&
      parentInstanceId &&
      this.store?.setWorktreeLineage
    ) {
      lineage = this.store.setWorktreeLineage(worktree.id, {
        worktreeId: worktree.id,
        worktreeInstanceId: childInstanceId,
        parentWorktreeId: lineageResolution.parent.worktree.id,
        parentWorktreeInstanceId: parentInstanceId,
        origin: lineageResolution.origin,
        capture: lineageResolution.capture,
        ...(lineageResolution.orchestrationRunId
          ? { orchestrationRunId: lineageResolution.orchestrationRunId }
          : {}),
        ...(lineageResolution.taskId ? { taskId: lineageResolution.taskId } : {}),
        ...(lineageResolution.coordinatorHandle
          ? { coordinatorHandle: lineageResolution.coordinatorHandle }
          : {}),
        ...(lineageResolution.createdByTerminalHandle
          ? { createdByTerminalHandle: lineageResolution.createdByTerminalHandle }
          : {}),
        createdAt
      })
    } else if (lineageResolution.parent.type === 'worktree') {
      warnings.push({
        code: 'LINEAGE_PARENT_CONTEXT_MISSING',
        message:
          'Worktree created, but Yiru could not record lineage because instance identity was unavailable.',
        details: {
          childHasInstanceId: Boolean(childInstanceId),
          parentHasInstanceId: Boolean(parentInstanceId),
          storeSupportsLineage: Boolean(this.store?.setWorktreeLineage)
        }
      })
    }
    if (childInstanceId && this.store?.setWorkspaceLineage) {
      workspaceLineage = this.store.setWorkspaceLineage({
        childWorkspaceKey: worktreeWorkspaceKey(worktree.id),
        childInstanceId,
        parentWorkspaceKey: lineageResolution.parent.workspaceKey,
        parentInstanceId,
        origin: lineageResolution.origin,
        capture: lineageResolution.capture,
        ...(lineageResolution.taskId ? { taskId: lineageResolution.taskId } : {}),
        ...(lineageResolution.orchestrationRunId
          ? { orchestrationRunId: lineageResolution.orchestrationRunId }
          : {}),
        ...(lineageResolution.coordinatorHandle
          ? { coordinatorHandle: lineageResolution.coordinatorHandle }
          : {}),
        ...(lineageResolution.createdByTerminalHandle
          ? { createdByTerminalHandle: lineageResolution.createdByTerminalHandle }
          : {}),
        createdAt
      })
    }
    return { lineage, workspaceLineage, warnings }
  }

  protected pasteStartupDraftWhenReady(handle: string, draft: WorktreeStartupDraftPaste): void {
    void this.waitForStartupDraftReady(handle, draft.agent)
      .then((ptyId) => {
        if (!ptyId) {
          console.warn('[worktree-create] agent did not become ready for draft paste')
          return
        }
        this.ptyController?.write(
          ptyId,
          `${BRACKETED_PASTE_BEGIN}${draft.content}${BRACKETED_PASTE_END}`
        )
      })
      .catch((error) => {
        console.warn('[worktree-create] failed to paste startup draft:', error)
      })
  }

  protected sendStartupFollowupWhenReady(handle: string, followup: WorktreeStartupFollowup): void {
    void this.waitForStartupFollowupReady(handle, followup.expectedProcess)
      .then((ptyId) => {
        if (!ptyId) {
          console.warn('[worktree-create] agent did not become ready for follow-up prompt')
          return
        }
        this.ptyController?.write(ptyId, `${followup.prompt}\r`)
      })
      .catch((error) => {
        console.warn('[worktree-create] failed to send startup follow-up prompt:', error)
      })
  }

  protected async createDefaultTabTerminals(
    worktreeSelector: string,
    worktreeId: string,
    defaultTabs: CreateWorktreeResult['defaultTabs'] | undefined
  ): Promise<string[]> {
    if (!defaultTabs || defaultTabs.tabs.length === 0 || !this.ptyController?.spawn) {
      return []
    }
    const handles: string[] = []
    for (const template of defaultTabs.tabs) {
      try {
        const command = template.command?.trim()
        const terminal = await this.createTerminal(worktreeSelector, {
          ...(template.title ? { title: template.title } : {}),
          ...(command && defaultTabs.runCommands ? { command } : {})
        })
        handles.push(terminal.handle)
        if (template.color && terminal.tabId) {
          await this.setMobileSessionTabProps(`id:${worktreeId}`, {
            tabId: terminal.tabId,
            color: template.color
          })
        }
      } catch (error) {
        console.warn(`[worktree-create] Failed to create default tab for ${worktreeId}:`, error)
      }
    }
    return handles
  }
}
