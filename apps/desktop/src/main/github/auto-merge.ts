import type { PRConflictSummary, GitHubPRMergeMethod } from '~shared/types'

import { detectRepositoryMergeMetadata } from './branch-hydration'
import { getPRByNumber } from './branch-lookup'
import { PR_AUTO_MERGE_IDENTITY_JSON_FIELDS, GITHUB_AUTO_MERGE_METHODS } from './branch-metadata'
import type { GhExecOptions } from './client-foundation'
import { getPRConflictSummary } from './conflict-summary'
import { ghExecFileAsync, type LocalGitExecOptions, type OwnerRepo } from './github-cli'

export type PRAutoMergeIdentity = {
  id?: string
  headRefOid?: string
  baseRefName?: string
}

export async function getPRAutoMergeIdentity(
  prNumber: number,
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions
): Promise<PRAutoMergeIdentity | null> {
  const args = ['pr', 'view', String(prNumber), '--json', PR_AUTO_MERGE_IDENTITY_JSON_FIELDS]
  if (ownerRepo) {
    args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
  }
  const { stdout } = await ghExecFileAsync(args, ghOptions)
  const data = JSON.parse(stdout) as PRAutoMergeIdentity
  return {
    id: typeof data.id === 'string' ? data.id : undefined,
    headRefOid: typeof data.headRefOid === 'string' ? data.headRefOid : undefined,
    baseRefName: typeof data.baseRefName === 'string' ? data.baseRefName : undefined
  }
}

export async function runPRAutoMergeCommand(
  prNumber: number,
  method: GitHubPRMergeMethod,
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions
): Promise<void> {
  const args = ['pr', 'merge', String(prNumber), '--auto', `--${method}`]
  if (ownerRepo) {
    args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
  }
  await ghExecFileAsync(args, {
    ...ghOptions,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' }
  })
}

export async function shouldUseMergeQueueAutoMerge(
  pr: PRAutoMergeIdentity,
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions
): Promise<boolean> {
  if (!ownerRepo || !pr.baseRefName) {
    return false
  }
  const mergeMetadata = await detectRepositoryMergeMetadata(ownerRepo, pr.baseRefName, ghOptions)
  return mergeMetadata.mergeQueueRequired === true
}

export async function enablePRAutoMerge(
  prNumber: number,
  method: GitHubPRMergeMethod,
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pr = await getPRAutoMergeIdentity(prNumber, ownerRepo, ghOptions)
  if (!pr?.id) {
    return { ok: false, error: 'Could not resolve GitHub pull request ID' }
  }
  if (await shouldUseMergeQueueAutoMerge(pr, ownerRepo, ghOptions)) {
    await runPRAutoMergeCommand(prNumber, method, ownerRepo, ghOptions)
    return { ok: true }
  }
  const query = `mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!, $expectedHeadOid: GitObjectID) {
    enablePullRequestAutoMerge(input: {
      pullRequestId: $pullRequestId,
      mergeMethod: $mergeMethod,
      expectedHeadOid: $expectedHeadOid
    }) {
      pullRequest { id }
    }
  }`
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `pullRequestId=${pr.id}`,
    '-f',
    `mergeMethod=${GITHUB_AUTO_MERGE_METHODS[method]}`
  ]
  if (pr.headRefOid) {
    args.push('-f', `expectedHeadOid=${pr.headRefOid}`)
  }
  // Why: `gh pr merge --auto` can perform an immediate merge; this mutation
  // only creates GitHub's auto-merge request and lets branch requirements gate it.
  await ghExecFileAsync(args, {
    ...ghOptions,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' }
  })
  return { ok: true }
}

export async function getPRMergeBlocker(
  repoPath: string,
  prNumber: number,
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string | null> {
  if (!ownerRepo) {
    return null
  }

  try {
    const pr = await getPRByNumber(ownerRepo, prNumber, ghOptions)
    if (!pr) {
      return null
    }
    if (pr.reviewDecision === 'REVIEW_REQUIRED') {
      return 'This pull request requires review approval before it can be merged.'
    }
    if (pr.reviewDecision === 'CHANGES_REQUESTED') {
      return 'This pull request has requested changes and cannot be merged yet.'
    }
    if (pr.mergeQueueRequired === true) {
      return 'This pull request must be merged through GitHub merge queue. Use Merge when ready instead.'
    }
    // Why: a legacy connection-scoped request has no verified local path for
    // the conflict-summary git commands, so fail closed before spawning them.
    if (
      connectionId ||
      pr.mergeable !== 'CONFLICTING' ||
      !pr.baseRefName ||
      !pr.baseRefOid ||
      !pr.headRefOid
    ) {
      return null
    }

    const summary = await getPRConflictSummary(
      repoPath,
      pr.baseRefName,
      pr.baseRefOid,
      pr.headRefOid,
      localGitOptions
    )
    return formatMergeConflictBlocker(pr.baseRefName, summary)
  } catch {
    // Why: conflict preflight should improve stale UI diagnostics, not make
    // merge impossible when the lookup endpoint has a transient failure.
    return null
  }
}

export function formatMergeConflictBlocker(
  baseRefName: string,
  summary: PRConflictSummary | undefined
): string {
  const heading = 'This pull request has merge conflicts and cannot be merged yet.'
  if (!summary || summary.files.length === 0) {
    return `${heading}\nUpdate the branch with ${baseRefName} and resolve the conflicts before merging.`
  }

  const files = summary.files.map((file) => `- ${file}`).join('\n')
  const behind = `${summary.commitsBehind} commit${summary.commitsBehind === 1 ? '' : 's'} behind ${baseRefName}`
  return `${heading}\n${behind} (base commit: ${summary.baseCommit}).\n\nConflicting files:\n${files}`
}
