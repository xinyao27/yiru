import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { scanAiVaultSessions } from './session-scanner'
import { isolatedScanRoots, writeJsonlFile } from './session-scanner-test-fixtures'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

describe('Claude session cwd drift', () => {
  it('resumes from the session start directory after the transcript cwd changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yiru-ai-vault-claude-cwd-'))
    tempRoots.push(root)
    const roots = isolatedScanRoots(root)
    await writeJsonlFile(join(roots.claudeProjectsDir, 'project', 'drift-session.jsonl'), [
      {
        type: 'user',
        sessionId: 'drift-session',
        timestamp: '2026-05-01T10:00:00.000Z',
        cwd: '/repo/app',
        gitBranch: 'main',
        message: { role: 'user', content: 'start here' }
      },
      {
        type: 'user',
        sessionId: 'drift-session',
        timestamp: '2026-05-01T10:05:00.000Z',
        cwd: '/repo/app/services/api',
        gitBranch: 'main',
        message: { role: 'user', content: 'now in a subdirectory' }
      }
    ])

    const result = await scanAiVaultSessions({ ...roots, platform: 'darwin' })

    expect(result.sessions.find((session) => session.agent === 'claude')).toMatchObject({
      sessionId: 'drift-session',
      cwd: '/repo/app',
      resumeCommand: "cd '/repo/app' && claude --resume 'drift-session'"
    })
  })
})
