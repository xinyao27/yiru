import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { promoteLocalDownloadedFolder } from './local-downloaded-folder-promotion'

const testDirectories: string[] = []

async function createTestDirectory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yiru-folder-promotion-'))
  testDirectories.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    testDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('promoteLocalDownloadedFolder', () => {
  it('publishes a completed nested folder', async () => {
    const root = await createTestDirectory()
    const staging = join(root, '.staging')
    const destination = join(root, 'download')
    await mkdir(join(staging, 'nested'), { recursive: true })
    await writeFile(join(staging, 'nested', 'file.txt'), 'complete')

    await promoteLocalDownloadedFolder(staging, destination)

    await expect(readFile(join(destination, 'nested', 'file.txt'), 'utf8')).resolves.toBe(
      'complete'
    )
    await expect(readFile(join(staging, 'nested', 'file.txt'), 'utf8')).rejects.toThrow()
  })

  it('does not merge into an existing destination', async () => {
    const root = await createTestDirectory()
    const staging = join(root, '.staging')
    const destination = join(root, 'download')
    await mkdir(staging)
    await writeFile(join(staging, 'new.txt'), 'new')
    await mkdir(destination)
    await writeFile(join(destination, 'existing.txt'), 'existing')

    await expect(promoteLocalDownloadedFolder(staging, destination)).rejects.toThrow(
      'Destination folder already exists'
    )
    await expect(readFile(join(destination, 'existing.txt'), 'utf8')).resolves.toBe('existing')
    await expect(readFile(join(destination, 'new.txt'), 'utf8')).rejects.toThrow()
  })

  it('leaves no partial destination when canceled before promotion', async () => {
    const root = await createTestDirectory()
    const staging = join(root, '.staging')
    const destination = join(root, 'download')
    await mkdir(staging)
    await writeFile(join(staging, 'file.txt'), 'content')
    const controller = new AbortController()
    controller.abort(new Error('canceled'))

    await expect(
      promoteLocalDownloadedFolder(staging, destination, controller.signal)
    ).rejects.toThrow('canceled')
    await expect(readFile(join(destination, 'file.txt'), 'utf8')).rejects.toThrow()
  })
})
