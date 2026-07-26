import type { Worktree } from '../worktree/workspace-list-types'
import { UI_LAB_MARKDOWN, UI_LAB_WORKTREE_ID } from './fixtures'

const UI_LAB_WORKTREE_PATH = '/ui-lab/ridley'

export function uiLabWorktrees(): Worktree[] {
  return [
    {
      workspaceKind: 'git',
      worktreeId: UI_LAB_WORKTREE_ID,
      repoId: UI_LAB_WORKTREE_ID,
      repo: 'ridley',
      branch: 'feature/liquid-glass',
      displayName: 'Liquid Glass mobile',
      path: UI_LAB_WORKTREE_PATH,
      liveTerminalCount: 1,
      hasAttachedPty: true,
      preview: 'Refining the mobile control layer and native navigation chrome.',
      unread: true,
      isPinned: true,
      isActive: true,
      linkedPR: { number: 8421, state: 'OPEN' },
      status: 'working',
      agents: []
    }
  ]
}

export function uiLabRepos() {
  return {
    repos: [
      {
        id: UI_LAB_WORKTREE_ID,
        displayName: 'ridley',
        badgeColor: '#4F7CAC',
        worktreeBaseRef: 'main'
      }
    ]
  }
}

export function uiLabGitStatus() {
  return {
    branch: 'feature/liquid-glass',
    head: '91f65de',
    conflictOperation: 'unknown',
    upstreamStatus: {
      hasUpstream: true,
      upstreamName: 'origin/feature/liquid-glass',
      ahead: 2,
      behind: 0
    },
    entries: [
      {
        path: 'apps/mobile/app/h/[hostId]/session/[worktreeId].tsx',
        status: 'modified',
        area: 'unstaged',
        added: 18,
        removed: 7
      },
      {
        path: 'apps/mobile/src/components/glass/surface.tsx',
        status: 'modified',
        area: 'staged',
        added: 12,
        removed: 4
      },
      {
        path: 'apps/mobile/src/ui-lab/runtime-fixtures.ts',
        status: 'untracked',
        area: 'untracked',
        added: 96,
        removed: 0
      }
    ]
  }
}

export function uiLabBranchCompare() {
  return {
    summary: {
      baseRef: 'main',
      baseOid: '3c813aa',
      compareRef: 'HEAD',
      headOid: '91f65de',
      mergeBase: '3c813aa',
      changedFiles: 1,
      commitsAhead: 2,
      status: 'ready'
    },
    entries: [
      {
        path: 'apps/mobile/src/components/glass/group.tsx',
        status: 'modified',
        added: 9,
        removed: 3
      }
    ]
  }
}

export function uiLabWorktreeMetadata() {
  return {
    worktree: {
      baseRef: 'main',
      diffComments: [],
      mobileDiffReview: { version: 1, files: {} }
    }
  }
}

export function uiLabDiff() {
  return {
    kind: 'text',
    originalContent: [
      "import { View } from 'react-native'",
      '',
      'export function Surface() {',
      '  return <View className="bg-card p-3" />',
      '}'
    ].join('\n'),
    modifiedContent: [
      "import { MobileGlassSurface } from './glass/surface'",
      '',
      'export function Surface() {',
      '  return <MobileGlassSurface className="overflow-hidden rounded-2xl p-3" />',
      '}'
    ].join('\n')
  }
}

export function uiLabDirectory(relativePath: string) {
  if (relativePath === 'apps') {
    return [
      { name: 'mobile', isDirectory: true },
      { name: 'desktop', isDirectory: true }
    ]
  }
  if (relativePath === 'apps/mobile') {
    return [
      { name: 'app', isDirectory: true },
      { name: 'src', isDirectory: true }
    ]
  }
  return [
    { name: 'apps', isDirectory: true },
    { name: 'docs', isDirectory: true },
    { name: 'AGENTS.md', isDirectory: false },
    { name: 'README.md', isDirectory: false },
    { name: 'package.json', isDirectory: false }
  ]
}

export function uiLabFile(relativePath: string) {
  const content = relativePath.endsWith('.md') ? UI_LAB_MARKDOWN : uiLabSourceFixture(relativePath)
  return { content, truncated: false, byteLength: content.length, isBinary: false }
}

export function uiLabGitHistory() {
  return {
    items: [
      {
        id: '91f65de3',
        parentIds: ['78fdb202'],
        displayId: '91f65de',
        subject: 'Refine mobile Liquid Glass chrome',
        message: 'Refine mobile Liquid Glass chrome',
        author: 'Yiru',
        timestamp: 1_775_000_000
      },
      {
        id: '78fdb202',
        parentIds: ['3c813aa1'],
        displayId: '78fdb20',
        subject: 'Add production-route UI Lab fixtures',
        message: 'Add production-route UI Lab fixtures',
        author: 'Yiru',
        timestamp: 1_774_990_000
      }
    ],
    hasIncomingChanges: false,
    hasOutgoingChanges: true,
    hasMore: false,
    limit: 50
  }
}

export function uiLabAgentSessions(hostId: string) {
  return {
    sessions: [
      {
        id: 'ui-lab-history-1',
        executionHostId: hostId,
        agent: 'codex',
        sessionId: 'ui-lab-history-session',
        title: 'Polish the mobile control layer',
        cwd: UI_LAB_WORKTREE_PATH,
        branch: 'feature/liquid-glass',
        model: 'gpt-5',
        filePath: '/ui-lab/session.jsonl',
        codexHome: null,
        createdAt: '2026-07-26T08:00:00.000Z',
        updatedAt: '2026-07-26T10:30:00.000Z',
        modifiedAt: '2026-07-26T10:30:00.000Z',
        messageCount: 6,
        totalTokens: 12_480,
        previewMessages: [
          {
            role: 'user',
            text: 'Make every mobile surface feel native on iOS 26.',
            timestamp: '2026-07-26T10:20:00.000Z'
          },
          {
            role: 'assistant',
            text: 'The native headers and grouped Glass controls are ready for visual QA.',
            timestamp: '2026-07-26T10:30:00.000Z'
          }
        ],
        queuedMessageCount: 0,
        subagentTranscriptCount: 0,
        resumeCommand: 'codex resume ui-lab-history-session',
        subagent: null
      }
    ],
    issues: []
  }
}

function uiLabSourceFixture(relativePath: string): string {
  return [
    `// ${relativePath}`,
    '',
    "import { View } from 'react-native'",
    '',
    'export function Preview() {',
    '  return <View className="flex-1 rounded-2xl bg-card" />',
    '}'
  ].join('\n')
}
