import type { TerminalStartupCwdMissingDirFallback } from '~shared/terminal/startup-cwd'
import type { GlobalSettings } from '~shared/types'

import type { Store } from '../persistence'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { RuntimePtyController } from '../runtime/yiru-runtime/model/terminal-observation'
import type { GetSelectedCodexHomePath, PrepareClaudeAuth } from './host-env-values'

export type RuntimePtySpawnArgs = Parameters<NonNullable<RuntimePtyController['spawn']>>[0]

export type RuntimePtySpawnDependencies = {
  getLocalPtyStartupPromise: (connectionId?: string | null) => Promise<void> | undefined
  assertFolderWorkspacePtyPathUsable: (worktreeId: string | undefined) => Promise<void>
  resolvePtySpawnStartupCwd: (
    worktreeId: string | undefined,
    cwd: string | undefined,
    missingDirFallback?: TerminalStartupCwdMissingDirFallback
  ) => string | undefined
  runtime: YiruRuntimeService | undefined
  getSelectedCodexHomePath: GetSelectedCodexHomePath | undefined
  getSettings: (() => GlobalSettings) | undefined
  prepareClaudeAuth: PrepareClaudeAuth | undefined
  store: Store | undefined
}
