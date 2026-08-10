import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'
import { parseShellArgs, stripAgentBrowserTargetArgs } from '~main/browser/agent-browser-bridge'
import { BrowserError } from '~main/browser/cdp-bridge'
import {
  RuntimeBrowserCommands,
  type RuntimeBrowserCommandHost,
  type RuntimeBrowserShellAdapter
} from '~main/runtime/yiru-runtime-browser'
import type { BrowserUploadResult } from '~shared/runtime-types'

type BrowserFileTargetParams = {
  page?: string
  worktree?: string
}

type BrowserFileTarget = {
  browserPageId: string
  worktreeId: string
  worktreePath: string
}

const SAFE_EXEC_COMMANDS = new Set([
  'back',
  'check',
  'click',
  'console',
  'dblclick',
  'drag',
  'errors',
  'eval',
  'fill',
  'find',
  'focus',
  'forward',
  'get',
  'highlight',
  'hover',
  'is',
  'keyboard',
  'mouse',
  'open',
  'press',
  'pushstate',
  'read',
  'reload',
  'scroll',
  'scrollintoview',
  'select',
  'set',
  'snapshot',
  'storage',
  'tab',
  'type',
  'uncheck',
  'vitals',
  'wait'
])

const SAFE_EXEC_FLAGS = new Map([
  ['console', new Set(['--clear'])],
  ['errors', new Set(['--clear'])],
  [
    'snapshot',
    new Set(['-c', '-d', '-i', '-s', '--compact', '--depth', '--interactive', '--selector'])
  ]
])

async function resolveWorktreeFilePath(
  host: RuntimeBrowserCommandHost,
  worktreePath: string,
  requestedPath: string
): Promise<string> {
  if (isAbsolute(requestedPath)) {
    throw new BrowserError('invalid_argument', 'Browser file paths must be worktree-relative')
  }
  const resolvedPath = resolve(worktreePath, requestedPath)
  const relativePath = relative(worktreePath, resolvedPath)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new BrowserError('invalid_argument', 'Browser file paths must stay inside the worktree')
  }
  return host.resolveBrowserFilePath(resolvedPath)
}

export class NodeRuntimeBrowserCommands extends RuntimeBrowserCommands {
  private readonly nodeHost: RuntimeBrowserCommandHost

  constructor(nodeHost: RuntimeBrowserCommandHost, shellAdapter: RuntimeBrowserShellAdapter) {
    super(nodeHost, shellAdapter)
    this.nodeHost = nodeHost
  }

  override async browserUpload(
    params: { element: string; files: string[] } & BrowserFileTargetParams
  ): Promise<BrowserUploadResult> {
    const target = await this.resolveFileTarget(params)
    const files = await Promise.all(
      params.files.map((file) => resolveWorktreeFilePath(this.nodeHost, target.worktreePath, file))
    )
    return this.requireBridge().upload(
      params.element,
      files,
      target.worktreeId,
      target.browserPageId
    )
  }

  override async browserDownload(
    params: { selector: string; path: string } & BrowserFileTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveFileTarget(params)
    return this.requireBridge().download(
      params.selector,
      await resolveWorktreeFilePath(this.nodeHost, target.worktreePath, params.path),
      target.worktreeId,
      target.browserPageId
    )
  }

  override async browserExec(
    params: { command: string } & BrowserFileTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const args = stripAgentBrowserTargetArgs(parseShellArgs(params.command.trim()))
    const command = args[0]
    // Why: raw agent-browser also exposes package installation, plugins, auth
    // files, and arbitrary output paths. Keep exec on the page-only DSL subset;
    // typed file commands below add worktree authorization before touching disk.
    if (!command || !SAFE_EXEC_COMMANDS.has(command)) {
      throw new BrowserError(
        'invalid_argument',
        'This agent-browser command is unavailable through host exec'
      )
    }
    const allowedFlags = SAFE_EXEC_FLAGS.get(command) ?? new Set<string>()
    const unsupportedFlag = args
      .slice(1)
      .find((arg) => arg.startsWith('-') && !allowedFlags.has(arg.split('=', 1)[0] ?? arg))
    if (unsupportedFlag) {
      throw new BrowserError('invalid_argument', 'This agent-browser flag is unavailable here')
    }
    return super.browserExec(params)
  }

  private requireBridge() {
    const bridge = this.nodeHost.getAgentBrowserBridge()
    if (!bridge) {
      throw new BrowserError('browser_no_tab', 'No browser session is active')
    }
    return bridge
  }

  private async resolveFileTarget(params: BrowserFileTargetParams): Promise<BrowserFileTarget> {
    const bridge = this.requireBridge()
    const explicitWorktree = params.worktree
      ? await this.nodeHost.resolveWorktreeSelector(params.worktree)
      : null
    const browserPageId = params.page ?? bridge.getActivePageId(explicitWorktree?.id)
    if (!browserPageId) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    const pageWorktreeId = bridge.getWorktreeIdForTab(browserPageId)
    const worktreeId = explicitWorktree?.id ?? pageWorktreeId
    if (!worktreeId || (explicitWorktree && pageWorktreeId !== explicitWorktree.id)) {
      throw new BrowserError('invalid_argument', 'Browser file commands require a worktree page')
    }
    const worktree =
      explicitWorktree ?? (await this.nodeHost.resolveWorktreeSelector(`id:${worktreeId}`))
    return { browserPageId, worktreeId, worktreePath: worktree.path }
  }
}
