import type { ContractRouter } from '@orpc/contract'

import type { RuntimeProcedureMeta } from '../access-meta.js'
import { shellBrowserContract } from './browser.js'
import { shellEventsContract } from './events.js'
import { shellFilesContract } from './files.js'

export const shellContract = {
  browser: shellBrowserContract,
  events: shellEventsContract,
  files: shellFilesContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './browser.js'
export * from './events.js'
export * from './files.js'
