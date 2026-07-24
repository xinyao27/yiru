import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { superviseForegroundServe } from './serve-update-supervisor'

describe('foreground serve update supervisor', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts only a ready replacement at the requested version', async () => {
    const root = mkdtempSync(join(tmpdir(), 'yiru-serve-supervisor-'))
    roots.push(root)
    const handoffPath = join(root, 'handoff.json')
    const handoff = {
      schemaVersion: 1 as const,
      phase: 'install-requested' as const,
      fromVersion: '1.0.0',
      targetVersion: '1.1.0',
      servingPid: 42
    }
    writeFileSync(handoffPath, JSON.stringify(handoff))
    const child = Object.assign(new EventEmitter(), {
      pid: 42,
      kill: vi.fn(() => true)
    })

    const result = superviseForegroundServe({
      executable: '/Applications/Yiru.app/Contents/MacOS/Yiru',
      childArgs: ['--serve'],
      spawnOptions: {},
      spawnChild: vi.fn() as never,
      child: child as never,
      handoffPath,
      expectedHandoff: handoff
    })
    child.emit('message', { type: 'yiru:serve-ready', version: '1.1.0', runtimeId: 'runtime-2' })
    child.emit('exit', 0, null)

    await expect(result).resolves.toBe(0)
    expect(child.kill).not.toHaveBeenCalled()
    expect(existsSync(handoffPath)).toBe(false)
  })
})
