import { iterateTerminalInputChunks } from '@yiru/runtime-protocol/workbench/terminal/input'
import {
  AGENT_PROMPT_BRACKETED_PASTE_END,
  AGENT_PROMPT_SUBMIT,
  AGENT_PROMPT_SUBMIT_DELAY_MS
} from '~main/agents/core/prompt-injection'

import { RuntimeTerminalGetPendingForegroundAgentRefreshForTitle } from './get-pending-foreground-agent-refresh-for-title'

export abstract class RuntimeTerminalWriteTerminalAction extends RuntimeTerminalGetPendingForegroundAgentRefreshForTitle {
  protected async writeTerminalAction(
    ptyId: string,
    action: { text?: string; enter?: boolean; interrupt?: boolean },
    payload: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<void> {
    // Why: direct terminal.send can carry paste-sized text from RPC/mobile
    // clients; chunk text before PTY/ConPTY while preserving suffix separation.
    const hasText = typeof action.text === 'string' && action.text.length > 0
    const hasSuffix = action.enter || action.interrupt
    if (hasText) {
      await this.writeTerminalInputChunks(ptyId, action.text!, options)
    }
    if (hasSuffix) {
      const suffix = (action.enter ? '\r' : '') + (action.interrupt ? '\x03' : '')
      if (hasText) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      try {
        await options.beforeWrite?.(ptyId)
        options.reserveWrite?.(ptyId)
      } catch (error) {
        if (options.suffixFailureError) {
          throw new Error(options.suffixFailureError)
        }
        throw error
      }
      const suffixWrote = this.ptyController?.write(ptyId, suffix) ?? false
      if (!suffixWrote) {
        throw new Error(options.suffixFailureError ?? 'terminal_not_writable')
      }
      await options.afterWrite?.(ptyId)
      return
    }
    if (hasText) {
      return
    }

    await options.beforeWrite?.(ptyId)
    options.reserveWrite?.(ptyId)
    const wrote = this.ptyController?.write(ptyId, payload) ?? false
    if (!wrote) {
      throw new Error('terminal_not_writable')
    }
    await options.afterWrite?.(ptyId)
  }

  protected async writeTerminalInputChunks(
    ptyId: string,
    text: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
    } = {}
  ): Promise<void> {
    const chunks = iterateTerminalInputChunks(text)
    let chunk = chunks.next()
    while (!chunk.done) {
      await options.beforeWrite?.(ptyId)
      options.reserveWrite?.(ptyId)
      const wrote = this.ptyController?.write(ptyId, chunk.value) ?? false
      if (!wrote) {
        throw new Error('terminal_not_writable')
      }
      await options.afterWrite?.(ptyId)
      chunk = chunks.next()
      if (!chunk.done) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
  }

  protected async writeTerminalAgentPrompt(
    ptyId: string,
    pastePayload: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<void> {
    let wrotePasteBytes = false
    let completedPaste = false
    try {
      const chunks = iterateTerminalInputChunks(pastePayload)
      let chunk = chunks.next()
      while (!chunk.done) {
        await options.beforeWrite?.(ptyId)
        const wrote = this.ptyController?.write(ptyId, chunk.value) ?? false
        if (!wrote) {
          throw new Error('terminal_not_writable')
        }
        wrotePasteBytes = true
        chunk = chunks.next()
        if (!chunk.done) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }
      completedPaste = true
    } catch (error) {
      if (wrotePasteBytes && !completedPaste) {
        this.ptyController?.write(ptyId, AGENT_PROMPT_BRACKETED_PASTE_END)
      }
      throw error
    }

    await new Promise((resolve) => setTimeout(resolve, AGENT_PROMPT_SUBMIT_DELAY_MS))
    try {
      await options.beforeWrite?.(ptyId)
    } catch (error) {
      if (options.suffixFailureError) {
        throw new Error(options.suffixFailureError)
      }
      throw error
    }
    const suffixWrote = this.ptyController?.write(ptyId, AGENT_PROMPT_SUBMIT) ?? false
    if (!suffixWrote) {
      throw new Error(options.suffixFailureError ?? 'terminal_not_writable')
    }
  }
}
