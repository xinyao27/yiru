import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import {
  readMobileReviewCreatedTerminal,
  readMobileReviewTerminalSendAccepted
} from '../diff/review-rpc'

// Pure launch path for the PR triage actions ("Fix checks with AI" / "Resolve
// conflicts with AI"). Reuses the same two RPCs the diff-review send flow uses —
// session.tabs.createTerminal then terminal.send — so the prompt is dropped into a
// fresh agent terminal in the worktree. There is no higher-level agent-composer RPC
// on mobile, so this createTerminal+send pair is the launch mechanism.
export async function createTerminalAndSendPrompt(
  client: RpcClient,
  worktreeId: string,
  prompt: string
): Promise<void> {
  const created = await callRuntimeOrpc(client, (runtime) => runtime.session.tabs.createTerminal, {
    worktree: `id:${worktreeId}`
  })
  const terminalTab = readMobileReviewCreatedTerminal(created)
  if (!terminalTab) {
    throw new Error('Created terminal response was invalid')
  }
  const sent = await callRuntimeOrpc(client, (runtime) => runtime.terminal.send, {
    terminal: terminalTab.terminal,
    text: prompt,
    enter: true
  })
  if (!readMobileReviewTerminalSendAccepted(sent)) {
    throw new Error('Terminal input is locked')
  }
}
