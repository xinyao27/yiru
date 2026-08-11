import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'

export type AgentRowBranch = {
  row: RuntimeWorktreeAgentRow
  children: AgentRowBranch[]
  visibleRowCount: number
}

export type AgentRowLineageTree = {
  rootRows: RuntimeWorktreeAgentRow[]
  childrenByParentPaneKey: Map<string, RuntimeWorktreeAgentRow[]>
}

// Mirrors the desktop buildAgentRowLineageTree: groups a flat agent list into a
// spawn tree by parentPaneKey. The wire rows already carry a resolved
// parentPaneKey (the server reads the orchestration db), so this only has to
// group and guard against malformed (cyclic / dangling-parent) metadata.
export function buildAgentRowLineageTree(
  rows: readonly RuntimeWorktreeAgentRow[]
): AgentRowLineageTree {
  const byPaneKey = new Map<string, RuntimeWorktreeAgentRow>()
  for (const row of rows) {
    if (!byPaneKey.has(row.paneKey)) {
      byPaneKey.set(row.paneKey, row)
    }
  }

  const childrenByParentPaneKey = new Map<string, RuntimeWorktreeAgentRow[]>()
  const childPaneKeys = new Set<string>()
  for (const row of rows) {
    const parentPaneKey = row.parentPaneKey
    // Why: ignore a parent that points at the row itself or at a pane not in
    // this list — treat those as roots rather than dropping them.
    if (!parentPaneKey || parentPaneKey === row.paneKey || !byPaneKey.has(parentPaneKey)) {
      continue
    }
    childPaneKeys.add(row.paneKey)
    const siblings = childrenByParentPaneKey.get(parentPaneKey)
    if (siblings) {
      siblings.push(row)
    } else {
      childrenByParentPaneKey.set(parentPaneKey, [row])
    }
  }

  const rootRows = rows.filter((row) => !childPaneKeys.has(row.paneKey))
  if (rootRows.length === 0 && rows.length > 0) {
    // Why: a closed cycle leaves no root. Keep every agent visible as a flat
    // root instead of hiding all participants.
    return { rootRows: [...rows], childrenByParentPaneKey: new Map() }
  }

  return { rootRows, childrenByParentPaneKey }
}

export function buildAgentRowBranches(rows: readonly RuntimeWorktreeAgentRow[]): AgentRowBranch[] {
  const { rootRows, childrenByParentPaneKey } = buildAgentRowLineageTree(rows)
  const emitted = new Set<string>()
  const buildBranch = (
    row: RuntimeWorktreeAgentRow,
    ancestors: ReadonlySet<string>
  ): AgentRowBranch | null => {
    if (ancestors.has(row.paneKey) || emitted.has(row.paneKey)) {
      return null
    }
    emitted.add(row.paneKey)
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(row.paneKey)
    const children: AgentRowBranch[] = []
    for (const child of childrenByParentPaneKey.get(row.paneKey) ?? []) {
      const branch = buildBranch(child, nextAncestors)
      if (branch) {
        children.push(branch)
      }
    }
    return {
      row,
      children,
      visibleRowCount: 1 + children.reduce((count, child) => count + child.visibleRowCount, 0)
    }
  }

  const branches: AgentRowBranch[] = []
  for (const root of rootRows) {
    const branch = buildBranch(root, new Set())
    if (branch) {
      branches.push(branch)
    }
  }

  // Why: a cyclic component beside a valid root has no entry in rootRows.
  // Promote every still-unseen row to a root so malformed metadata stays visible.
  for (const row of rows) {
    const branch = buildBranch(row, new Set())
    if (branch) {
      branches.push(branch)
    }
  }
  return branches
}
