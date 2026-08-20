import type { TuiAgent } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import type { RuntimeRepoListResult } from './contract/repo-types.js' with {
  'resolution-mode': 'import'
}
import type { RuntimeSettingsResult } from './contract/settings-types.js' with {
  'resolution-mode': 'import'
}
import type { WorktreeCreateInput } from './contract/worktree-input.js' with {
  'resolution-mode': 'import'
}
import type {
  RuntimeWorktreeActivateResult,
  RuntimeWorktreeCreateResult,
  RuntimeWorktreePsResult,
  RuntimeWorktreeRemoveResult,
  RuntimeWorktreeSleepResult
} from './contract/worktree-types.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_WORKTREE_PS_ORPC_PATH = '/worktree/ps'
export const MOBILE_WORKTREE_ACTIVATE_ORPC_PATH = '/worktree/activate'
export const MOBILE_WORKTREE_CREATE_ORPC_PATH = '/worktree/create'
export const MOBILE_WORKTREE_REMOVE_ORPC_PATH = '/worktree/rm'
export const MOBILE_WORKTREE_SET_ORPC_PATH = '/worktree/set'
export const MOBILE_WORKTREE_SLEEP_ORPC_PATH = '/worktree/sleep'
export const MOBILE_WORKTREE_SHOW_ORPC_PATH = '/worktree/show'
export const MOBILE_REPO_LIST_ORPC_PATH = '/repo/list'
export const MOBILE_PREFLIGHT_DETECT_AGENTS_ORPC_PATH = '/preflight/detectAgents'
export const MOBILE_PREFLIGHT_DETECT_REMOTE_AGENTS_ORPC_PATH = '/preflight/detectRemoteAgents'
export const MOBILE_SETTINGS_GET_ORPC_PATH = '/settings/get'

const MOBILE_WORKSPACE_CREATE_AGENT_VALUES = [
  'claude',
  'claude-agent-teams',
  'openclaude',
  'codex',
  'autohand',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin',
  'ante',
  'trae'
] as const satisfies readonly TuiAgent[]

const MOBILE_WORKSPACE_CREATE_AGENTS_ARE_EXHAUSTIVE: Exclude<
  TuiAgent,
  (typeof MOBILE_WORKSPACE_CREATE_AGENT_VALUES)[number]
> extends never
  ? true
  : false = true

void MOBILE_WORKSPACE_CREATE_AGENTS_ARE_EXHAUSTIVE

export const MobileWorkspaceListRequestSchema = z.object({
  limit: z.number().int().positive().optional()
})

export const MobileWorkspaceSelectorRequestSchema = z.object({ worktree: z.string().min(1) })

export const MobileWorktreeShowRequestSchema = MobileWorkspaceSelectorRequestSchema

export const MobileWorktreeShowResultSchema = z.object({
  worktree: z.object({
    baseRef: z.string().nullable().optional(),
    // Why: native's Source Control / Agent History headers need the live worktree
    // label (mirrors Expo's getLiveWorktreeDisplayName), not the snapshot handed
    // to the screen at navigation time — mergeWorktree guarantees this is never
    // empty (meta name || branch || repo default || folder basename).
    displayName: z.string().optional()
  })
})

export const MobileWorkspaceActivateRequestSchema = MobileWorkspaceSelectorRequestSchema.extend({
  notifyClients: z.boolean().optional()
})

export const MobileWorkspaceActivateResultSchema = z.object({
  repoId: z.string(),
  worktreeId: z.string(),
  activated: z.boolean(),
  sleepingAgentWake: z.enum(['requested', 'unsupported-headless', 'not-applicable'])
})

export const MobileWorkspaceCreateRequestSchema = z.object({
  repo: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  compareBaseRef: z.string().min(1).optional(),
  branchNameOverride: z.string().min(1).optional(),
  comment: z.string().min(1).optional(),
  setupDecision: z.enum(['run', 'skip', 'inherit']).optional(),
  startupCommand: z.string().min(1).optional(),
  startupDraft: z.string().min(1).optional(),
  startupAgent: z.enum(MOBILE_WORKSPACE_CREATE_AGENT_VALUES).optional(),
  createdWithAgent: z.enum(MOBILE_WORKSPACE_CREATE_AGENT_VALUES).optional(),
  pushTarget: z
    .object({
      remoteName: z.string().min(1),
      branchName: z.string().min(1),
      remoteUrl: z.string().min(1).optional(),
      remoteCreated: z.boolean().optional()
    })
    .optional(),
  linkedPR: z.number().int().positive().optional(),
  linkedGitLabMR: z.number().int().positive().optional(),
  activate: z.boolean().optional()
})

export const MobileWorkspaceCreateResultSchema = z.object({
  worktree: z.object({ id: z.string() })
})

export const MobileWorkspaceDetectedAgentsSchema = z.array(z.string())

export const MobileWorkspaceDetectRemoteAgentsRequestSchema = z.object({
  connectionId: z.string().min(1)
})

export const MobileWorkspaceRuntimeSettingsSchema = z.object({
  settings: z.object({
    defaultTuiAgent: z.string().nullable(),
    disabledTuiAgents: z.array(z.string()),
    agentCmdOverrides: z.record(z.string(), z.string()),
    agentDefaultArgs: z.record(z.string(), z.string()),
    agentDefaultEnv: z.record(z.string(), z.record(z.string(), z.string())),
    prBotAuthorOverrides: z.array(z.string())
  })
})

export const MobileWorkspaceSleepResultSchema = z.object({ worktreeId: z.string() })

export const MobileWorkspacePinRequestSchema = MobileWorkspaceSelectorRequestSchema.extend({
  isPinned: z.boolean()
})

export const MobileWorkspacePinResultSchema = z.object({})

export const MobileWorkspaceRemoveRequestSchema = MobileWorkspaceSelectorRequestSchema.extend({
  force: z.boolean().optional(),
  runHooks: z.boolean().optional()
})

export const MobileWorkspaceRemoveResultSchema = z.object({
  removed: z.boolean(),
  preservedBranch: z.object({ branchName: z.string(), head: z.string().optional() }).optional(),
  warning: z.string().optional()
})

const MobileWorkspaceLinkedPullRequestSchema = z.object({
  number: z.number().int().positive(),
  state: z.string()
})

const MobileWorkspaceAgentSchema = z.object({
  paneKey: z.string(),
  parentPaneKey: z.string().nullable(),
  state: z.enum(['working', 'blocked', 'waiting', 'done']),
  agentType: z.string().nullable(),
  prompt: z.string(),
  taskTitle: z.string().nullable(),
  displayName: z.string().nullable(),
  lastAssistantMessage: z.string().nullable(),
  toolName: z.string().nullable(),
  toolInput: z.string().nullable(),
  interrupted: z.boolean(),
  stateStartedAt: z.number().int(),
  updatedAt: z.number().int()
})

// Why: native clients need a small, backwards-compatible projection of the much
// larger sidebar snapshot. Unknown additive fields are intentionally stripped.
export const MobileWorkspaceListItemSchema = z.object({
  workspaceKind: z.enum(['git', 'folder-workspace']).optional(),
  worktreeId: z.string(),
  repoId: z.string(),
  hostId: z.string().optional(),
  resumeTargetStatus: z.enum(['local', 'runtime', 'unknown']).optional(),
  terminalPlatform: z.string().optional(),
  priorWorktreeIds: z.array(z.string()).optional(),
  repo: z.string(),
  path: z.string(),
  branch: z.string(),
  displayName: z.string(),
  workspaceStatus: z.string(),
  isArchived: z.boolean(),
  isMainWorktree: z.boolean().optional(),
  hasHostSidebarActivity: z.boolean(),
  worktreeInstanceId: z.string().optional(),
  lineageWorktreeInstanceId: z.string().optional(),
  parentWorktreeInstanceId: z.string().optional(),
  parentWorktreeId: z.string().nullable(),
  childWorktreeIds: z.array(z.string()),
  sortOrder: z.number(),
  manualOrder: z.number().optional(),
  createdAt: z.number().int().optional(),
  linkedPR: MobileWorkspaceLinkedPullRequestSchema.nullable(),
  linkedGitLabMR: z.number().int().positive().nullable(),
  comment: z.string(),
  isPinned: z.boolean(),
  isActive: z.boolean(),
  unread: z.boolean(),
  liveTerminalCount: z.number().int().nonnegative(),
  hasAttachedPty: z.boolean(),
  lastActivityAt: z.number().int().optional(),
  lastOutputAt: z.number().int().nullable(),
  preview: z.string(),
  status: z.enum(['active', 'working', 'permission', 'done', 'inactive']),
  agents: z.array(MobileWorkspaceAgentSchema)
})

export const MobileWorkspaceListSchema = z.object({
  worktrees: z.array(MobileWorkspaceListItemSchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export const MobileRepoIconSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lucide'), name: z.string() }),
  z.object({ type: z.literal('emoji'), emoji: z.string() }),
  z.object({
    type: z.literal('image'),
    src: z.string(),
    source: z.enum(['upload', 'file', 'favicon', 'github']),
    label: z.string().optional()
  })
])

export const MobileRepoListItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  displayName: z.string(),
  badgeColor: z.string(),
  connectionId: z.string().nullable().optional(),
  repoIcon: MobileRepoIconSchema.nullable().optional(),
  kind: z.enum(['git', 'folder']).optional(),
  worktreeBaseRef: z.string().optional(),
  upstream: z.object({ owner: z.string(), repo: z.string() }).nullable().optional(),
  gitRemoteIdentity: z
    .object({ canonicalKey: z.string(), remoteName: z.string(), remoteUrl: z.string() })
    .nullable()
    .optional()
})

export const MobileRepoListSchema = z.object({ repos: z.array(MobileRepoListItemSchema) })

export type MobileWorkspaceListItem = z.infer<typeof MobileWorkspaceListItemSchema>
export type MobileWorkspaceList = z.infer<typeof MobileWorkspaceListSchema>
export type MobileWorkspaceListRequest = z.infer<typeof MobileWorkspaceListRequestSchema>

export const MOBILE_WORKSPACE_CREATE_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileWorkspaceCreateRequestSchema
> extends WorktreeCreateInput
  ? true
  : false = true

export const MOBILE_WORKSPACE_CREATE_RESULT_WIRE_IS_COMPATIBLE: RuntimeWorktreeCreateResult extends z.infer<
  typeof MobileWorkspaceCreateResultSchema
>
  ? true
  : false = true

export const MOBILE_WORKSPACE_SETTINGS_WIRE_IS_COMPATIBLE: RuntimeSettingsResult extends z.infer<
  typeof MobileWorkspaceRuntimeSettingsSchema
>
  ? true
  : false = true

// Why: projections strip renderer-only fields, while assignability keeps the native list from
// silently losing state that its visual grammar depends on.
export const MOBILE_WORKSPACE_LIST_WIRE_IS_COMPATIBLE: RuntimeWorktreePsResult extends MobileWorkspaceList
  ? true
  : false = true

export const MOBILE_REPO_LIST_WIRE_IS_COMPATIBLE: RuntimeRepoListResult extends z.infer<
  typeof MobileRepoListSchema
>
  ? true
  : false = true

export const MOBILE_WORKSPACE_ACTIVATE_WIRE_IS_COMPATIBLE: RuntimeWorktreeActivateResult extends z.infer<
  typeof MobileWorkspaceActivateResultSchema
>
  ? true
  : false = true

export const MOBILE_WORKSPACE_SLEEP_WIRE_IS_COMPATIBLE: RuntimeWorktreeSleepResult extends z.infer<
  typeof MobileWorkspaceSleepResultSchema
>
  ? true
  : false = true

export const MOBILE_WORKSPACE_REMOVE_WIRE_IS_COMPATIBLE: RuntimeWorktreeRemoveResult extends z.infer<
  typeof MobileWorkspaceRemoveResultSchema
>
  ? true
  : false = true
