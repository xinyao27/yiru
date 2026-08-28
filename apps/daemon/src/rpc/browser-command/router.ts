import { createEnvironmentHandlers } from './environment'
import type { BrowserFileDownloadService } from './file-download'
import { createInteractionHandlers } from './interaction'
import { createNavigationHandlers } from './navigation'
import { createObservabilityHandlers } from './observability'
import { createScreencastHandlers } from './screencast'

export type BrowserCommandDelegate = <TResult>(method: string, input: unknown) => Promise<TResult>

export function createBrowserCommandRouter(
  delegate: BrowserCommandDelegate,
  downloads: BrowserFileDownloadService
) {
  return {
    ...createEnvironmentHandlers(delegate),
    ...createInteractionHandlers(delegate, downloads),
    ...createNavigationHandlers(delegate),
    ...createObservabilityHandlers(delegate),
    ...createScreencastHandlers(delegate)
  }
}
