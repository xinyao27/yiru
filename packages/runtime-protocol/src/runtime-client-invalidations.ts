export type RuntimeClientInvalidationStreamMessage =
  | {
      type: 'ready'
      subscriptionId: string
      snapshot?: { repos?: unknown[] }
    }
  | { type: 'reposChanged' }
  | { type: 'worktreesChanged'; repoId: string }
  | { type: 'end' }
