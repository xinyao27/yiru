import { constants } from 'node:fs'
import { cp, copyFile, lstat, mkdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

import { assertNoClobberRenameDestinationAvailable } from '~main/filesystem-rename-collision'

import type { Store } from '../persistence/store'
import { resolveAuthorizedPath, isENOENT } from './auth'
import { resolveLocalDroppedPathsForAgent } from './dropped-path-resolution'
import {
  stageOneSourceForRuntimeUpload,
  type ImportSkipReason,
  type StagedExternalImportSource
} from './external-import-staging'

export type ResolveDroppedPathsResult = {
  resolvedPaths: string[]
  skipped: { sourcePath: string; reason: ImportSkipReason }[]
  failed: { sourcePath: string; reason: string }[]
}

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

export function createFilesystemMutationService(store: Store) {
  return {
    createFile: async (args: { filePath: string }): Promise<void> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      await mkdir(dirname(filePath), { recursive: true })
      try {
        await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
      } catch (error) {
        rethrowWithUserMessage(error, filePath)
      }
    },
    createDirectory: async (args: { directoryPath: string }): Promise<void> => {
      const directoryPath = await resolveAuthorizedPath(args.directoryPath, store)
      await assertNotExists(directoryPath)
      await mkdir(directoryPath, { recursive: true })
    },
    rename: async (args: { oldPath: string; newPath: string }): Promise<void> => {
      // Why: rename operates on directory entries, so preserve symlink leaves
      // rather than following and renaming their targets.
      const oldPath = await resolveAuthorizedPath(args.oldPath, store, { preserveSymlink: true })
      const newPath = await resolveAuthorizedPath(args.newPath, store, { preserveSymlink: true })
      await assertNoClobberRenameDestinationAvailable(oldPath, newPath)
      await rename(oldPath, newPath)
    },
    copy: async (args: { sourcePath: string; destinationPath: string }): Promise<void> => {
      const sourcePath = await resolveAuthorizedPath(args.sourcePath, store, {
        preserveSymlink: true
      })
      const destinationPath = await resolveAuthorizedPath(args.destinationPath, store, {
        preserveSymlink: true
      })
      await mkdir(dirname(destinationPath), { recursive: true })
      const sourceStat = await lstat(sourcePath)
      await (sourceStat.isDirectory() || sourceStat.isSymbolicLink()
        ? cp(sourcePath, destinationPath, {
            recursive: sourceStat.isDirectory(),
            dereference: false,
            errorOnExist: true,
            force: false
          })
        : copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL))
    },
    stageExternalPathsForRuntimeUpload: async (args: {
      sourcePaths: string[]
    }): Promise<{ sources: StagedExternalImportSource[] }> => {
      const sources: StagedExternalImportSource[] = []
      for (const sourcePath of args.sourcePaths) {
        sources.push(await stageOneSourceForRuntimeUpload(sourcePath))
      }
      return { sources }
    },
    // Why: local shell drops reference paths in place. Remote upload staging
    // is a separate explicit procedure and never changes this result shape.
    resolveDroppedPathsForAgent: async (args: {
      paths: string[]
      worktreePath: string
    }): Promise<ResolveDroppedPathsResult> => ({
      resolvedPaths: resolveLocalDroppedPathsForAgent(args.paths, args.worktreePath),
      skipped: [],
      failed: []
    })
  }
}

export type {
  ImportSkipReason,
  StagedExternalImportEntry,
  StagedExternalImportSource
} from './external-import-staging'
