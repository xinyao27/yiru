import { runtimeContract } from '@yiru/runtime-protocol/contract'

import { browserRuntimeHandlers } from '../rpc/orpc/router-direct/browser'

// Why: the Node host exposes the complete browser contract through backend-neutral
// page ids. Its shell adapter validates the real socket-derived shellConnectionId,
// Chrome/CDP owns page and grab operations, and agent-browser exec stays target-pinned.
// File-bearing commands are narrowed to worktree-relative paths by the host command
// adapter; profile import derives native source locations itself and writes cookies
// through the isolated Chrome profile backend rather than an Electron BrowserSession.
export const nodeBrowserRuntimeHandlers = browserRuntimeHandlers

export const nodeBrowserRuntimeContract = { browser: runtimeContract.browser } as const
