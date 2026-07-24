import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { downloadFolderViaSftp } from './ssh-filesystem-download'
import type { SftpFactory } from './ssh-filesystem-file-upload'

const testDirectories: string[] = []

function stats(kind: 'directory' | 'file' | 'link'): Stats {
  return {
    isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'link'
  } as Stats
}

function entry(filename: string, kind: 'directory' | 'file' | 'link'): FileEntryWithStats {
  return { filename, longname: filename, attrs: stats(kind) }
}

async function testDestination(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'yiru-sftp-folder-'))
  testDirectories.push(root)
  return join(root, 'download')
}

afterEach(async () => {
  await Promise.all(
    testDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('downloadFolderViaSftp', () => {
  it('downloads nested entries with remote and local path rules kept separate', async () => {
    const destination = await testDestination()
    const fastGetPaths: string[] = []
    const end = vi.fn()
    const sftp = {
      stat: (_path: string, callback: (error: Error | undefined, value: Stats) => void) =>
        callback(undefined, stats('directory')),
      readdir: (
        path: string,
        callback: (error: Error | undefined, value: FileEntryWithStats[]) => void
      ) =>
        callback(
          undefined,
          path === '/srv/project'
            ? [entry('nested', 'directory'), entry('readme.txt', 'file')]
            : [entry('child.txt', 'file')]
        ),
      fastGet: (source: string, local: string, callback: (error?: Error) => void) => {
        fastGetPaths.push(source)
        void writeFile(local, source).then(() => callback())
      },
      end
    } as unknown as SFTPWrapper

    await downloadFolderViaSftp(async () => sftp, '/srv/project', destination)

    expect(fastGetPaths).toEqual(['/srv/project/nested/child.txt', '/srv/project/readme.txt'])
    await expect(readFile(join(destination, 'nested', 'child.txt'), 'utf8')).resolves.toBe(
      '/srv/project/nested/child.txt'
    )
    expect(end).toHaveBeenCalledOnce()
  })

  it('rejects symbolic links without materializing a destination tree', async () => {
    const destination = await testDestination()
    const end = vi.fn()
    const sftp = {
      stat: (_path: string, callback: (error: Error | undefined, value: Stats) => void) =>
        callback(undefined, stats('directory')),
      readdir: (
        _path: string,
        callback: (error: Error | undefined, value: FileEntryWithStats[]) => void
      ) => callback(undefined, [entry('outside', 'link')]),
      end
    } as unknown as SFTPWrapper

    await expect(
      downloadFolderViaSftp(async () => sftp, '/srv/project', destination)
    ).rejects.toThrow("Cannot download symbolic link 'outside'")
    await expect(readFile(join(destination, 'outside'), 'utf8')).rejects.toThrow()
    expect(end).toHaveBeenCalledOnce()
  })

  it('closes SFTP and rejects with the abort reason', async () => {
    const destination = await testDestination()
    const controller = new AbortController()
    let releaseReadDir!: (error: Error) => void
    let markReadDirStarted!: () => void
    const readDirStarted = new Promise<void>((resolve) => {
      markReadDirStarted = resolve
    })
    const sftp = {
      stat: (_path: string, callback: (error: Error | undefined, value: Stats) => void) =>
        callback(undefined, stats('directory')),
      readdir: (_path: string, callback: (error: Error) => void) => {
        releaseReadDir = callback
        markReadDirStarted()
      },
      end: () => releaseReadDir?.(new Error('closed'))
    } as unknown as SFTPWrapper
    const createSftp: SftpFactory = async () => sftp
    const download = downloadFolderViaSftp(createSftp, '/srv/project', destination, {
      signal: controller.signal
    })
    await readDirStarted

    controller.abort(new Error('canceled'))

    await expect(download).rejects.toThrow('canceled')
  })
})
