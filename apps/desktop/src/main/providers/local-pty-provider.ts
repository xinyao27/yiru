export {
  LOCAL_PTY_FORCE_KILL_RETRY_MS,
  LOCAL_PTY_GRACEFUL_FORCE_TIMEOUT_MS,
  LOCAL_PTY_PHYSICAL_EXIT_TIMEOUT_MS
} from './local-pty-provider/state'
export type { LocalPtyProviderOptions } from './local-pty-provider/model'

import { LocalPtyProviderEvents } from './local-pty-provider/events'
import type { IPtyProvider } from './types'

export class LocalPtyProvider extends LocalPtyProviderEvents implements IPtyProvider {}
