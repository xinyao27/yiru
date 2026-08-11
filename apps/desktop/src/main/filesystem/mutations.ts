import { constants } from 'node:fs'
import {
  cp,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/* eslint-disable max-lines -- Why: filesystem mutation IPC handlers stay centralized so
authorization and external import behavior remain audited together. */
import { assertNoClobberRenameDestinationAvailable } from '~shared/filesystem-rename-collision'

import type { MainIpcRegistration } from '../ipc-registration'
import type { Store } from '../persistence'
import { authorizeExternalPath, resolveAuthorizedPath, isENOENT } from './auth'
import { resolveLocalDroppedPathsForAgent } from './dropped-path-resolution'

/**
 * Re-throw filesystem errors with user-friendly messages.
 * The `wx` flag on writeFile throws a raw EEXIST with no helpful message,
 * so we catch it here and provide context the renderer can display directly.
 */
function rethrowWithUserMessage(error: unknown, targetPath: string): never {
  const name = basename(targetPath)
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      throw new Error(`A file or folder named '${name}' already exists in this location`)
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(`Permission denied: unable to create '${name}'`)
    }
  }
  throw error
}

/**
 * Ensure `targetPath` does not already exist. Throws if it does.
 *
 * Note: this is a non-atomic check — a concurrent operation could create the
 * path between `lstat` and the caller's next action. Acceptable for a desktop
 * app with low concurrency; `createFile` uses the `wx` flag for an atomic
 * alternative where possible.
 */
async function assertNotExists(targetPath: string): Promise<void> {
  try {
    await lstat(targetPath)
    throw new Error(
      `A file or folder named '${basename(targetPath)}' already exists in this location`
    )
  } catch (error) {
    if (!isENOENT(error)) {
      throw error
    }
  }
}

/**
 * IPC handlers for file/folder creation and renaming.
 * Deletion is handled separately via `file-host:deletePath` (shell.trashItem).
 */
export function registerFilesystemMutationHandlers(
  ipcMain: MainIpcRegistration,
  store: Store
): void {
  ipcMain.handle(
    'file-host:createFile',
    async (_event, args: { filePath: string; connectionId?: string }): Promise<void> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      await mkdir(dirname(filePath), { recursive: true })
      try {
        // Use the 'wx' flag for atomic create-if-not-exists, avoiding TOCTOU races
        await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
      } catch (error) {
        rethrowWithUserMessage(error, filePath)
      }
    }
  )

  ipcMain.handle(
    'file-host:createDir',
    async (_event, args: { dirPath: string; connectionId?: string }): Promise<void> => {
      const dirPath = await resolveAuthorizedPath(args.dirPath, store)
      await assertNotExists(dirPath)
      await mkdir(dirPath, { recursive: true })
    }
  )

  // Note: fs.rename throws EXDEV if old and new paths are on different
  // filesystems/volumes. This is unlikely since both paths are under the same
  // workspace root, but a cross-drive rename would surface as an IPC error.
  ipcMain.handle(
    'file-host:rename',
    async (
      _event,
      args: { oldPath: string; newPath: string; connectionId?: string }
    ): Promise<void> => {
      // Why: rename() operates on directory entries, not file contents. If
      // oldPath is a symlink, we must rename the link itself rather than
      // resolving it to its target — following the link would rename the
      // target file (potentially elsewhere in the worktree) and leave the
      // symlink dangling. newPath must also preserve its leaf so we don't
      // accidentally write into a symlinked destination name.
      const oldPath = await resolveAuthorizedPath(args.oldPath, store, { preserveSymlink: true })
      const newPath = await resolveAuthorizedPath(args.newPath, store, { preserveSymlink: true })
      await assertNoClobberRenameDestinationAvailable(oldPath, newPath)
      await rename(oldPath, newPath)
    }
  )

  ipcMain.handle(
    'file-host:copy',
    async (
      _event,
      args: { sourcePath: string; destinationPath: string; connectionId?: string }
    ): Promise<void> => {
      const sourcePath = await resolveAuthorizedPath(args.sourcePath, store, {
        preserveSymlink: true
      })
      const destinationPath = await resolveAuthorizedPath(args.destinationPath, store, {
        preserveSymlink: true
      })
      await mkdir(dirname(destinationPath), { recursive: true })
      const sourceStat = await lstat(sourcePath)
      // Why: Explorer clipboard copy includes folders and links. Preserve
      // links instead of following them, and keep every destination no-clobber.
      await (sourceStat.isDirectory() || sourceStat.isSymbolicLink()
        ? cp(sourcePath, destinationPath, {
            recursive: sourceStat.isDirectory(),
            dereference: false,
            errorOnExist: true,
            force: false
          })
        : copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL))
    }
  )

  ipcMain.handle(
    'file-host:stageExternalPathsForRuntimeUpload',
    async (
      _event,
      args: { sourcePaths: string[] }
    ): Promise<{ sources: StagedExternalImportSource[] }> => {
      const sources: StagedExternalImportSource[] = []
      for (const sourcePath of args.sourcePaths) {
        sources.push(await stageOneSourceForRuntimeUpload(sourcePath))
      }
      return { sources }
    }
  )

  // Why: terminal drag-and-drop resolver. Local worktrees pass paths through
  // unchanged (reference-in-place; preserves zero-latency drop). Kept as a
  // separate IPC from file-host:importExternalPaths because terminal semantics differ
  // from the explorer's "copy into user-picked destDir".
  ipcMain.handle(
    'file-host:resolveDroppedPathsForAgent',
    async (
      _event,
      args: { paths: string[]; worktreePath: string; connectionId?: string }
    ): Promise<ResolveDroppedPathsResult> => {
      // Why: `== null` (not `!args.connectionId`) so an empty string is
      // treated as a renderer error, not silently routed to the local branch.
      if (args.connectionId != null) {
        throw new Error('Uploading dropped files to a remote host is no longer supported')
      }
      return {
        resolvedPaths: resolveLocalDroppedPathsForAgent(args.paths, args.worktreePath),
        skipped: [],
        failed: []
      }
    }
  )
}

export type ImportSkipReason = 'missing' | 'symlink' | 'permission-denied' | 'unsupported'

export type ResolveDroppedPathsResult = {
  resolvedPaths: string[]
  skipped: { sourcePath: string; reason: ImportSkipReason }[]
  failed: { sourcePath: string; reason: string }[]
}

export type StagedExternalImportSource =
  | {
      sourcePath: string
      status: 'staged'
      name: string
      kind: 'file' | 'directory'
      entries: StagedExternalImportEntry[]
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: ImportSkipReason
    }
  | {
      sourcePath: string
      status: 'failed'
      reason: string
    }

export type StagedExternalImportEntry =
  | { relativePath: string; kind: 'directory' }
  | { relativePath: string; kind: 'file'; contentBase64: string }

const REMOTE_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024
const REMOTE_IMPORT_MAX_TOTAL_BYTES = 100 * 1024 * 1024

class RuntimeUploadSymlinkError extends Error {}

async function stageOneSourceForRuntimeUpload(
  sourcePath: string
): Promise<StagedExternalImportSource> {
  const resolvedSource = resolve(sourcePath)

  // Why: runtime uploads read client-local paths in the client main process;
  // authorize before lstat/readFile just like local copy imports.
  authorizeExternalPath(resolvedSource)

  let sourceStat: Awaited<ReturnType<typeof lstat>>
  try {
    sourceStat = await lstat(resolvedSource)
  } catch (error) {
    if (isENOENT(error)) {
      return { sourcePath, status: 'skipped', reason: 'missing' }
    }
    if (
      error instanceof Error &&
      'code' in error &&
      ((error as NodeJS.ErrnoException).code === 'EACCES' ||
        (error as NodeJS.ErrnoException).code === 'EPERM')
    ) {
      return { sourcePath, status: 'skipped', reason: 'permission-denied' }
    }
    return {
      sourcePath,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error)
    }
  }

  if (sourceStat.isSymbolicLink()) {
    return { sourcePath, status: 'skipped', reason: 'symlink' }
  }
  if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
    return { sourcePath, status: 'skipped', reason: 'unsupported' }
  }
  try {
    const entries = sourceStat.isDirectory()
      ? await stageDirectoryEntries(resolvedSource)
      : [(await stageFileEntry(resolvedSource, '')).entry]
    return {
      sourcePath,
      status: 'staged',
      name: basename(resolvedSource),
      kind: sourceStat.isDirectory() ? 'directory' : 'file',
      entries
    }
  } catch (error) {
    if (error instanceof RuntimeUploadSymlinkError) {
      return { sourcePath, status: 'skipped', reason: 'symlink' }
    }
    return {
      sourcePath,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

async function stageDirectoryEntries(rootPath: string): Promise<StagedExternalImportEntry[]> {
  const entries: StagedExternalImportEntry[] = [{ relativePath: '', kind: 'directory' }]
  let totalBytes = 0
  const rootRealPath = await realpath(rootPath)

  async function visit(dirPath: string): Promise<void> {
    const dirStat = await lstat(dirPath)
    if (dirStat.isSymbolicLink()) {
      throw new RuntimeUploadSymlinkError(
        `Symlink not allowed in '${normalizeRelativeUploadPath(relative(rootPath, dirPath))}'`
      )
    }
    if (!dirStat.isDirectory()) {
      throw new Error(
        `Unsupported file type in '${normalizeRelativeUploadPath(relative(rootPath, dirPath))}'`
      )
    }
    await assertRealPathInsideRoot(
      rootRealPath,
      dirPath,
      normalizeRelativeUploadPath(relative(rootPath, dirPath))
    )
    const dirEntries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of dirEntries) {
      const childPath = join(dirPath, entry.name)
      const childRelativePath = normalizeRelativeUploadPath(relative(rootPath, childPath))
      if (entry.isSymbolicLink()) {
        throw new RuntimeUploadSymlinkError(`Symlink not allowed in '${childRelativePath}'`)
      }
      if (entry.isDirectory()) {
        entries.push({ relativePath: childRelativePath, kind: 'directory' })
        await visit(childPath)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`Unsupported file type in '${childRelativePath}'`)
      }
      const stagedFile = await stageFileEntry(childPath, childRelativePath, {
        rootRealPath,
        totalBytesBefore: totalBytes
      })
      totalBytes += stagedFile.byteLength
      entries.push(stagedFile.entry)
    }
  }

  await visit(rootPath)
  return entries
}

async function stageFileEntry(
  filePath: string,
  relativePath: string,
  options?: { rootRealPath?: string; totalBytesBefore?: number }
): Promise<{ entry: StagedExternalImportEntry; byteLength: number }> {
  const statResult = await lstat(filePath)
  const displayPath = normalizeRelativeUploadPath(relativePath)
  if (statResult.isSymbolicLink()) {
    throw new RuntimeUploadSymlinkError(`Symlink not allowed in '${displayPath}'`)
  }
  if (!statResult.isFile()) {
    throw new Error(`Unsupported file type in '${displayPath}'`)
  }
  if (options?.rootRealPath) {
    await assertRealPathInsideRoot(options.rootRealPath, filePath, displayPath)
  }
  const initialTotalBytes =
    options?.totalBytesBefore === undefined
      ? statResult.size
      : options.totalBytesBefore + statResult.size
  assertRemoteUploadBudget(relativePath, statResult.size, initialTotalBytes)
  const fileHandle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const openedStat = await fileHandle.stat()
    if (!openedStat.isFile()) {
      throw new Error(`Unsupported file type in '${displayPath}'`)
    }
    if (
      openedStat.size !== statResult.size ||
      (statResult.ino !== 0 && openedStat.ino !== 0 && openedStat.ino !== statResult.ino) ||
      (statResult.dev !== 0 && openedStat.dev !== 0 && openedStat.dev !== statResult.dev)
    ) {
      throw new Error(`File changed during upload staging: '${displayPath}'`)
    }
    const totalBytes =
      options?.totalBytesBefore === undefined
        ? openedStat.size
        : options.totalBytesBefore + openedStat.size
    assertRemoteUploadBudget(relativePath, openedStat.size, totalBytes)
    const buffer = await fileHandle.readFile()
    const afterReadStat = await fileHandle.stat()
    if (afterReadStat.size !== openedStat.size) {
      throw new Error(`File changed during upload staging: '${displayPath}'`)
    }
    return {
      entry: {
        relativePath: displayPath,
        kind: 'file',
        contentBase64: buffer.toString('base64')
      },
      byteLength: openedStat.size
    }
  } finally {
    await fileHandle.close()
  }
}

async function assertRealPathInsideRoot(
  rootRealPath: string,
  candidatePath: string,
  displayPath: string
): Promise<void> {
  const candidateRealPath = await realpath(candidatePath)
  const relativeToRoot = relative(rootRealPath, candidateRealPath)
  // Why: `..name` is a valid child path; only `..` and `../...` escape.
  if (
    relativeToRoot !== '' &&
    (relativeToRoot === '..' || relativeToRoot.startsWith(`..${sep}`) || isAbsolute(relativeToRoot))
  ) {
    throw new Error(`Path escaped upload root during staging: '${displayPath}'`)
  }
}

function assertRemoteUploadBudget(
  relativePath: string,
  fileBytes: number,
  totalBytes: number
): void {
  if (fileBytes > REMOTE_IMPORT_MAX_FILE_BYTES) {
    throw new Error(`'${relativePath}' is too large for remote import`)
  }
  if (totalBytes > REMOTE_IMPORT_MAX_TOTAL_BYTES) {
    throw new Error('Remote import is too large')
  }
}

function normalizeRelativeUploadPath(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/^\/+/, '')
}
