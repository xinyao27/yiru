// @ts-nocheck -- Vite Plus injects the vitest API at test time; production tsconfig intentionally omits that package.
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import type { CodexAppServerInvocation } from './codex-app-server-session'
import {
  runCodexSessionIndexHeal,
  type CodexSessionIndexHealPaths
} from './codex-session-index-heal'

// Stub codex app-server speaking the JSONL protocol for the heal pass:
// initialize → initialized → thread/read×N. Scenario-driven via STUB_CONFIG;
// every thread/read is appended to readLogFile so tests can assert order,
// batching (one spawn appends a server-start marker), and skip behavior.
const STUB_SERVER_SOURCE = `
const fs = require('node:fs')
const config = JSON.parse(process.env.STUB_CONFIG)
fs.appendFileSync(config.readLogFile, JSON.stringify({ serverStart: true }) + '\\n')
let buffer = ''
let inFlight = 0
let maxInFlight = 0
function send(message) {
  process.stdout.write(JSON.stringify(message) + '\\n')
}
if (config.scenario === 'no-subcommand') {
  process.stderr.write("error: unrecognized subcommand 'app-server'\\n")
  process.exit(2)
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.method === 'initialize') {
      send({ id: message.id, result: { userAgent: 'stub/0.0.0', codexHome: process.env.CODEX_HOME } })
      continue
    }
    if (message.method === 'initialized') continue
    if (message.method === 'thread/read') {
      const threadId = message.params.threadId
      if (config.scenario === 'unknown-method') {
        send({ id: message.id, error: { code: -32601, message: 'Method not found' } })
        continue
      }
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      setTimeout(() => {
        inFlight -= 1
        fs.appendFileSync(config.readLogFile, JSON.stringify({ threadId, maxInFlight }) + '\\n')
        if ((config.missingThreadIds || []).includes(threadId)) {
          send({ id: message.id, error: { code: -32600, message: 'no rollout found for thread id ' + threadId } })
          return
        }
        if ((config.failingThreadIds || []).includes(threadId)) {
          send({ id: message.id, error: { code: -32600, message: 'failed to parse rollout' } })
          return
        }
        if ((config.busyThreadIds || []).includes(threadId)) {
          send({ id: message.id, error: { code: -32600, message: 'database is locked' } })
          return
        }
        if (config.scenario === 'die-mid-batch' && threadId === config.dieOnThreadId) {
          process.exit(7)
        }
        send({ id: message.id, result: { thread: { id: threadId } } })
      }, 5)
      continue
    }
  }
})
process.stdin.on('end', () => process.exit(0))
`

let tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true })
  }
  tempRoots = []
})

function threadId(suffix: string): string {
  return `019f0000-1111-7222-8333-${suffix.padStart(12, '0')}`
}

function rolloutTarget(sessionsRoot: string, stamp: string, id: string): string {
  return join(sessionsRoot, '2026', '07', '01', `rollout-${stamp}-${id}.jsonl`)
}

function createHealRig(options: {
  scenario?: string
  auditedThreads?: { stamp: string; id: string; action?: string }[]
  missingThreadIds?: string[]
  failingThreadIds?: string[]
  busyThreadIds?: string[]
  dieOnThreadId?: string
}): {
  paths: CodexSessionIndexHealPaths
  readLogFile: string
  buildInvocation: (systemCodexHomePath: string, timeoutMs: number) => CodexAppServerInvocation
  readLog: () => { serverStarts: number; threadIds: string[]; maxInFlight: number }
} {
  const root = mkdtempSync(join(tmpdir(), 'yiru-codex-heal-'))
  tempRoots.push(root)
  const systemSessionsRoot = join(root, 'real-home', 'sessions')
  const stateDir = join(root, 'state')
  mkdirSync(stateDir, { recursive: true })
  const paths: CodexSessionIndexHealPaths = {
    auditLogPath: join(stateDir, 'audit.jsonl'),
    systemSessionsRoot,
    healLedgerPath: join(stateDir, 'index-heal-ledger.jsonl'),
    healMarkerPath: join(stateDir, 'index-heal-complete.json')
  }
  for (const [index, audited] of (options.auditedThreads ?? []).entries()) {
    appendFileSync(
      paths.auditLogPath,
      `${JSON.stringify({
        at: '2026-07-01T00:00:00.000Z',
        action: audited.action ?? 'hardlink',
        source: '/managed/sessions/x.jsonl',
        target: rolloutTarget(systemSessionsRoot, audited.stamp, audited.id),
        recordId: `audit-record-${index}`
      })}\n`
    )
  }
  const stubPath = join(root, 'stub-app-server.cjs')
  writeFileSync(stubPath, STUB_SERVER_SOURCE)
  const readLogFile = join(root, 'reads.jsonl')
  writeFileSync(readLogFile, '')
  return {
    paths,
    readLogFile,
    buildInvocation: (_systemCodexHomePath, timeoutMs) => ({
      command: process.execPath,
      args: [stubPath],
      env: {
        STUB_CONFIG: JSON.stringify({
          scenario: options.scenario ?? 'ok',
          readLogFile,
          missingThreadIds: options.missingThreadIds ?? [],
          failingThreadIds: options.failingThreadIds ?? [],
          busyThreadIds: options.busyThreadIds ?? [],
          dieOnThreadId: options.dieOnThreadId
        })
      },
      timeoutMs
    }),
    readLog: () => {
      const lines = readFileSync(readLogFile, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as { serverStart?: boolean; threadId?: string; maxInFlight?: number }
        )
      return {
        serverStarts: lines.filter((line) => line.serverStart).length,
        threadIds: lines.map((line) => line.threadId).filter((id): id is string => Boolean(id)),
        maxInFlight: Math.max(0, ...lines.map((line) => line.maxInFlight ?? 0))
      }
    }
  }
}

function readLedgerOutcomes(paths: CodexSessionIndexHealPaths): Record<string, string> {
  let contents = ''
  try {
    contents = readFileSync(paths.healLedgerPath, 'utf-8')
  } catch {
    return {}
  }
  const outcomes: Record<string, string> = {}
  for (const line of contents.split('\n').filter(Boolean)) {
    try {
      const record = JSON.parse(line) as { threadId: string; outcome: string }
      outcomes[record.threadId] = record.outcome
    } catch {
      // Torn tails are quarantined by the next append and ignored by readers.
    }
  }
  return outcomes
}

describe('runCodexSessionIndexHeal', () => {
  it('reads every backfilled session recent-first and completes with a marker', async () => {
    const rig = createHealRig({
      auditedThreads: [
        { stamp: '2026-07-01T10-00-00', id: threadId('1') },
        { stamp: '2026-07-03T10-00-00', id: threadId('3'), action: 'copy' },
        { stamp: '2026-07-02T10-00-00', id: threadId('2'), action: 'existing' }
      ]
    })

    const summary = await runCodexSessionIndexHeal(rig.paths, {
      buildInvocation: rig.buildInvocation,
      interBatchDelayMs: 0
    })

    expect(summary).toMatchObject({
      outcome: 'completed',
      pendingThreads: 3,
      healedThreads: 3,
      missingThreads: 0,
      failedThreads: 0
    })
    expect(rig.readLog().threadIds).toEqual([threadId('3'), threadId('2'), threadId('1')])
    expect(readLedgerOutcomes(rig.paths)).toEqual({
      [threadId('1')]: 'healed',
      [threadId('2')]: 'healed',
      [threadId('3')]: 'healed'
    })
    const marker = JSON.parse(readFileSync(rig.paths.healMarkerPath, 'utf-8')) as {
      systemSessionsRoot: string
      healedThreads: number
    }
    expect(marker.systemSessionsRoot).toBe(rig.paths.systemSessionsRoot)
    expect(marker.healedThreads).toBe(3)
  })

  it('is a no-op when the marker matches the audit ledger size', async () => {
    const rig = createHealRig({
      auditedThreads: [{ stamp: '2026-07-01T10-00-00', id: threadId('1') }]
    })
    const first = await runCodexSessionIndexHeal(rig.paths, {
      buildInvocation: rig.buildInvocation,
      interBatchDelayMs: 0
    })
    expect(first.outcome).toBe('completed')
    const second = await runCodexSessionIndexHeal(rig.paths, {
      buildInvocation: rig.buildInvocation,
      interBatchDelayMs: 0
    })
    expect(second.outcome).toBe('up-to-date')
    // One spawn from the first run only — the no-op run must not hit the CLI.
    expect(rig.readLog().serverStarts).toBe(1)
  })

  it('resumes only unprocessed sessions when the audit ledger grows', async () => {
    const rig = createHealRig({
      auditedThreads: [{ stamp: '2026-07-01T10-00-00', id: threadId('1') }]
    })
    await runCodexSessionIndexHeal(rig.paths, {
      buildInvocation: rig.buildInvocation,
      interBatchDelayMs: 0
    })
    appendFileSync(
      rig.paths.auditLogPath,
      `${JSON.stringify({
        action: 'hardlink',
        target: rolloutTarget(rig.paths.systemSessionsRoot, '2026-07-04T10-00-00', threadId('4'))
      })}\n`
    )

    const summary = await runCodexSessionIndexHeal(rig.paths, {
      buildInvocation: rig.buildInvocation,
      interBatchDelayMs: 0
    })

    expect(summary).toMatchObject({ outcome: 'completed', pendingThreads: 1, healedThreads: 1 })
    expect(rig.readLog().threadIds).toEqual([threadId('1'), threadId('4')])
  })
})
