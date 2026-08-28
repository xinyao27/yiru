import { randomUUID } from 'node:crypto'

import type {
  RuntimeTerminalRead,
  RuntimeTerminalSend,
  RuntimeTerminalResolvePane,
  RuntimeTerminalShow
} from '@yiru/runtime-protocol/workbench/runtime-types'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { AGENT_PROMPT_SUBMIT, buildAgentPromptPasteBytes } from '~main/agents/core/prompt-injection'

import {
  assertTerminalInputWithinLimitWithYield,
  buildSendPayload,
  getTerminalState,
  readTerminalTail
} from '../model/terminal-read'
import { RuntimeTerminalBuildTerminalVisualPane } from './build-terminal-visual-pane'

export abstract class RuntimeTerminalResolveTerminalPane extends RuntimeTerminalBuildTerminalVisualPane {
  resolveTerminalPane(paneKey: string): RuntimeTerminalResolvePane {
    // Why: the renderer context menu only knows the stable pane key; main owns
    // the runtime terminal handle that agents and CLI commands can address.
    const handle = this.getTerminalHandleForPaneKey(paneKey)
    if (!handle) {
      throw new Error('terminal_not_found')
    }
    const record = this.terminalSessions.getTerminalHandle(handle)
    const parsed = parsePaneKey(paneKey)
    return {
      handle,
      tabId: record?.tabId ?? parsed?.tabId ?? '',
      leafId: record?.leafId ?? parsed?.leafId ?? '',
      ptyId: record?.ptyId ?? null
    }
  }

  async showTerminal(handle: string): Promise<RuntimeTerminalShow> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      const worktreesById = await this.getResolvedWorktreeMap()
      return {
        ...this.buildPtyTerminalSummary(pty.pty, worktreesById),
        tabId: pty.pty.tabId ?? pty.record.tabId,
        leafId: parsePaneKey(pty.pty.paneKey ?? '')?.leafId ?? pty.record.leafId,
        paneRuntimeId: -1,
        ptyId: pty.pty.ptyId,
        rendererGraphEpoch: this.terminalSessions.getGraphEpoch(),
        transportGeneration: this.getTerminalTransportGeneration(pty.pty.ptyId)
      }
    }
    const graphEpoch = this.captureReadyGraphEpoch()
    const worktreesById = await this.getResolvedWorktreeMap()
    this.assertStableReadyGraph(graphEpoch)
    const { leaf } = this.getLiveLeafForHandle(handle)
    const summary = this.buildTerminalSummary(leaf, worktreesById)
    return {
      ...summary,
      paneRuntimeId: leaf.paneRuntimeId,
      ptyId: leaf.ptyId,
      rendererGraphEpoch: this.terminalSessions.getGraphEpoch(),
      transportGeneration: leaf.ptyId
        ? this.getTerminalTransportGeneration(leaf.ptyId)
        : randomUUID()
    }
  }

  async readTerminal(
    handle: string,
    opts: { cursor?: number; limit?: number } = {}
  ): Promise<RuntimeTerminalRead> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      const read = this.readPtyTerminal(handle, pty.pty, opts)
      return this.withVisibleSnapshotPreview(pty.pty.ptyId, read, opts)
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    const read = readTerminalTail({
      handle,
      status: getTerminalState(leaf),
      completedLines: leaf.tailBuffer,
      partialLine: leaf.tailPartialLine,
      completedLineCount: leaf.tailLinesTotal,
      bufferTruncated: leaf.tailTruncated,
      cursor: opts.cursor,
      limit: opts.limit
    })
    return leaf.ptyId ? this.withVisibleSnapshotPreview(leaf.ptyId, read, opts) : read
  }

  async sendTerminal(
    handle: string,
    action: {
      text?: string
      enter?: boolean
      interrupt?: boolean
    },
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<RuntimeTerminalSend> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_not_writable')
      }
      const payload = buildSendPayload(action)
      if (payload === null) {
        throw new Error('invalid_terminal_send')
      }
      await assertTerminalInputWithinLimitWithYield(action.text)
      await this.writeTerminalAction(pty.pty.ptyId, action, payload, options)
      return {
        handle,
        accepted: true,
        bytesWritten: Buffer.byteLength(payload, 'utf8')
      }
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    if (!leaf.writable || !leaf.ptyId) {
      throw new Error('terminal_not_writable')
    }
    const payload = buildSendPayload(action)
    if (payload === null) {
      throw new Error('invalid_terminal_send')
    }
    await assertTerminalInputWithinLimitWithYield(action.text)

    await this.writeTerminalAction(leaf.ptyId, action, payload, options)

    return {
      handle,
      accepted: true,
      bytesWritten: Buffer.byteLength(payload, 'utf8')
    }
  }

  async sendTerminalAgentPrompt(
    handle: string,
    prompt: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<RuntimeTerminalSend> {
    const payload = buildAgentPromptPasteBytes(prompt)
    const bytesWritten = Buffer.byteLength(`${payload}${AGENT_PROMPT_SUBMIT}`, 'utf8')
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_not_writable')
      }
      await assertTerminalInputWithinLimitWithYield(payload)
      await this.writeTerminalAgentPrompt(pty.pty.ptyId, payload, options)
      return { handle, accepted: true, bytesWritten }
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    if (!leaf.writable || !leaf.ptyId) {
      throw new Error('terminal_not_writable')
    }
    await assertTerminalInputWithinLimitWithYield(payload)
    await this.writeTerminalAgentPrompt(leaf.ptyId, payload, options)
    return { handle, accepted: true, bytesWritten }
  }
}
