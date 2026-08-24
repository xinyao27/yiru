import type { ChildProcess } from 'node:child_process'

import {
  buildRgArgs,
  createAccumulator,
  DEFAULT_SEARCH_MAX_RESULTS,
  finalize,
  ingestRgJsonLine,
  SEARCH_TIMEOUT_MS
} from '~shared/text-search'
import type { SearchOptions, SearchResult } from '~shared/types'

import { resolveAuthorizedPath } from '../filesystem/auth'
import { getLocalGitOptionsForRegisteredWorktree } from '../filesystem/local-worktree-runtime-options'
import { checkRgAvailable } from '../filesystem/rg-availability'
import { searchWithGitGrep } from '../filesystem/search-git'
import { wslAwareSpawn } from '../git/runner'
import { parseWslPath, toWindowsWslPath } from '../wsl'
import { joinWorktreeRelativePath, normalizeRuntimeRelativePath } from './relative-paths'
import { RuntimeFileCommandsLayer4 } from './runtime-file-commands-layer-4'
import type { ResolvedRuntimeFileWorktree } from './runtime-file-watcher-registry'

export class RuntimeFileCommands extends RuntimeFileCommandsLayer4 {
  protected async searchLocalRuntimeFiles(
    rootPath: string,
    options: SearchOptions
  ): Promise<SearchResult> {
    const store = this.host.requireStore()
    const authorizedRootPath = await resolveAuthorizedPath(rootPath, store)
    const localGitOptions = getLocalGitOptionsForRegisteredWorktree(
      store,
      rootPath,
      authorizedRootPath
    )
    const maxResults = Math.max(
      1,
      Math.min(options.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS, DEFAULT_SEARCH_MAX_RESULTS)
    )
    const rgAvailable = await checkRgAvailable(authorizedRootPath, localGitOptions.wslDistro)
    if (!rgAvailable) {
      return searchWithGitGrep(authorizedRootPath, options, maxResults, localGitOptions)
    }

    return new Promise((resolvePromise) => {
      const searchKey = `${this.host.getRuntimeId()}:${authorizedRootPath}`
      const rgArgs = buildRgArgs(options.query, authorizedRootPath, options)
      this.activeRuntimeTextSearches.get(searchKey)?.kill()

      const acc = createAccumulator()
      let stdoutBuffer = ''
      let resolved = false
      let child: ChildProcess | null = null
      const wslInfo = parseWslPath(authorizedRootPath)
      const transformAbsPath = wslInfo
        ? (p: string): string => toWindowsWslPath(p, wslInfo.distro)
        : undefined

      const resolveOnce = (): void => {
        if (resolved) {
          return
        }
        resolved = true
        if (this.activeRuntimeTextSearches.get(searchKey) === child) {
          this.activeRuntimeTextSearches.delete(searchKey)
        }
        cleanupListeners()
        resolvePromise(finalize(acc))
      }

      let killTimeout: ReturnType<typeof setTimeout> | null = null
      const cleanupListeners = (): void => {
        if (killTimeout) {
          clearTimeout(killTimeout)
          killTimeout = null
        }
        child?.stdout?.off('data', onStdoutData)
        child?.stderr?.off('data', onStderrData)
        child?.off('error', onError)
        child?.off('close', onClose)
      }

      const processLine = (line: string): void => {
        const verdict = ingestRgJsonLine(
          line,
          authorizedRootPath,
          acc,
          maxResults,
          transformAbsPath
        )
        if (verdict === 'stop') {
          child?.kill()
        }
      }

      const nextChild = wslAwareSpawn('rg', rgArgs, {
        cwd: authorizedRootPath,
        ...(localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {}),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      child = nextChild
      this.activeRuntimeTextSearches.set(searchKey, nextChild)

      nextChild.stdout!.setEncoding('utf-8')
      const onStdoutData = (chunk: string): void => {
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          processLine(line)
        }
      }
      const onStderrData = (): void => {
        // Drain stderr so rg cannot block on a full pipe.
      }
      const onError = (): void => resolveOnce()
      const onClose = (): void => {
        if (stdoutBuffer) {
          processLine(stdoutBuffer)
        }
        resolveOnce()
      }

      nextChild.stdout!.on('data', onStdoutData)
      nextChild.stderr!.on('data', onStderrData)
      nextChild.once('error', onError)
      nextChild.once('close', onClose)

      killTimeout = setTimeout(() => {
        acc.truncated = true
        child?.kill()
        resolveOnce()
      }, SEARCH_TIMEOUT_MS)
    })
  }

  protected async resolveFileExplorerPath(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ worktree: ResolvedRuntimeFileWorktree; path: string }> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const normalizedRelativePath = normalizeRuntimeRelativePath(relativePath)
    return {
      worktree: target.worktree,
      path: joinWorktreeRelativePath(target.worktree.path, normalizedRelativePath)
    }
  }
}
