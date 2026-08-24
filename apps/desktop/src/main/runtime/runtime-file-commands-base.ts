import type { ChildProcess } from 'node:child_process'

import { RuntimeMobileFilePathSearchCache } from './mobile-file-path-search'
import type { TerminalFileGrant } from './runtime-file-foundation'
import {
  MOBILE_FILE_PATH_SEARCH_CACHE_ENTRIES,
  MOBILE_FILE_PATH_SEARCH_CACHE_TTL_MS
} from './runtime-file-foundation'
import type { RuntimeFileCommandHost } from './runtime-file-watcher-registry'

export abstract class RuntimeFileCommandsBase {
  protected activeRuntimeTextSearches = new Map<string, ChildProcess>()
  protected terminalFileGrants = new Map<string, TerminalFileGrant>()
  protected mobileFilePathSearchCache = new RuntimeMobileFilePathSearchCache(
    MOBILE_FILE_PATH_SEARCH_CACHE_ENTRIES,
    MOBILE_FILE_PATH_SEARCH_CACHE_TTL_MS
  )
  protected readonly host: RuntimeFileCommandHost

  constructor(host: RuntimeFileCommandHost) {
    this.host = host
  }
}
