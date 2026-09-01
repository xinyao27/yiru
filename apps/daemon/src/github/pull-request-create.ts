import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult
} from '@yiru/runtime-protocol/model/review'
import {
  normalizeHostedReviewBaseRef,
  normalizeHostedReviewHeadRef
} from '@yiru/runtime-protocol/workbench/hosted-review-refs'

import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import { hostedReviewLocalGitOptionArgs } from './client-foundation'
import { getEnterpriseGitHubRepoSlug } from './enterprise-repository'
import {
  ghExecFileAsync,
  ghRepoExecOptions,
  extractExecError,
  acquire,
  release,
  getOwnerRepo,
  githubRepoContext
} from './github-cli'

export function classifyCreatePRError(error: unknown): CreateHostedReviewResult {
  const { stderr, stdout } = extractExecError(error)
  const message = `${stderr}\n${stdout}`.trim()
  if (message) {
    console.warn('createGitHubPullRequest failed:', message)
  }
  const lower = message.toLowerCase()
  if (
    lower.includes('not logged') ||
    lower.includes('not authenticated') ||
    lower.includes('authentication') ||
    lower.includes('gh auth login') ||
    lower.includes('http 401')
  ) {
    return {
      ok: false,
      code: 'auth_required',
      error:
        'Create PR failed: GitHub is not authenticated. Next step: run gh auth login in this environment.'
    }
  }
  if (lower.includes('already exists') || lower.includes('a pull request already exists')) {
    return {
      ok: false,
      code: 'already_exists',
      error: 'A pull request already exists for this branch.'
    }
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return {
      ok: false,
      code: 'unknown_completion',
      error: 'PR creation may have completed. Refreshing branch review state...'
    }
  }
  if (lower.includes('validation failed') || lower.includes('http 422')) {
    return {
      ok: false,
      code: 'validation',
      error:
        'Create PR failed: GitHub rejected the pull request. Check the base branch and branch state, then try again.'
    }
  }
  return {
    ok: false,
    code: 'unknown',
    error: 'Create PR failed: GitHub could not create the pull request. Try again in a moment.'
  }
}

export function parseCreatePRPayload(stdout: string): { number: number; url: string } | null {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = JSON.parse(trimmed) as { number?: unknown; url?: unknown }
    const number = Number(parsed.number)
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    if (Number.isInteger(number) && number > 0 && url) {
      return { number, url }
    }
  } catch {
    // Fall through to URL parsing for older gh versions without --json support.
  }
  // Why: gh prints the PR URL (not JSON) here; match any host, not just
  // github.com, so a GitHub Enterprise Server URL still parses directly (#8312).
  const urlMatch = trimmed.match(/https?:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/)
  if (!urlMatch) {
    return null
  }
  return { number: Number(urlMatch[1]), url: urlMatch[0] }
}

// Why: `gh --repo OWNER/REPO` resolves the shorthand against gh's default host
// (usually github.com), not the repo's remote — so a GHES repo would target a
// same-named github.com repo, or fail. Qualify with the host for GHES so gh hits
// the Enterprise server; this also preserves the host when gh has no cwd
// context (#8312). github.com keeps the bare shorthand.
export function ghRepoArg(slug: { owner: string; repo: string; host?: string }): string {
  return slug.host && slug.host.toLowerCase() !== 'github.com'
    ? `${slug.host}/${slug.owner}/${slug.repo}`
    : `${slug.owner}/${slug.repo}`
}

export async function findOpenPRByHeadBase(args: {
  repoPath: string
  repoArg: string
  head: string
  base: string
  connectionId?: string | null
  options?: HostedReviewExecutionOptions
}): Promise<{ number: number; url: string } | null> {
  const context = githubRepoContext(args.repoPath, args.connectionId)
  const { stdout } = await ghExecFileAsync(
    [
      'pr',
      'list',
      '--repo',
      args.repoArg,
      '--head',
      args.head,
      '--base',
      args.base,
      '--state',
      'open',
      '--limit',
      '2',
      '--json',
      'number,url'
    ],
    {
      ...ghRepoExecOptions(context),
      ...(args.connectionId ? {} : getHostedReviewLocalGitOptions(args.options))
    }
  )
  const list = JSON.parse(stdout) as { number?: number; url?: string }[]
  if (list.length !== 1 || !list[0]?.number || !list[0]?.url) {
    return null
  }
  return { number: list[0].number, url: list[0].url }
}

export async function readPullRequestTemplate(repoPath: string): Promise<string> {
  const relativeCandidates = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
    'docs/pull_request_template.md',
    'docs/PULL_REQUEST_TEMPLATE.md'
  ]
  for (const relativeCandidate of relativeCandidates) {
    try {
      return await readFile(join(repoPath, relativeCandidate), 'utf8')
    } catch {
      // Try the next conventional PR template path.
    }
  }
  return ''
}

export async function createGitHubPullRequest(
  repoPath: string,
  input: CreateHostedReviewInput,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<CreateHostedReviewResult> {
  if (input.provider !== 'github') {
    return {
      ok: false,
      code: 'unsupported_provider',
      error: 'Creating reviews for this provider is not supported yet.'
    }
  }

  // Why: github.com-only slug parsing returns null for GHES, so fall back to the
  // enterprise resolver (gh-authenticated custom host) before giving up (#8312).
  const ownerRepo =
    (await getOwnerRepo(repoPath, connectionId, ...hostedReviewLocalGitOptionArgs(options))) ??
    (await getEnterpriseGitHubRepoSlug(repoPath, connectionId, options))
  if (!ownerRepo) {
    return {
      ok: false,
      code: 'unsupported_provider',
      error: 'Creating pull requests requires a GitHub remote.'
    }
  }
  // Host-qualified for GHES so gh targets the Enterprise server, not github.com.
  const repoArg = ghRepoArg(ownerRepo)

  const base = normalizeHostedReviewBaseRef(input.base)
  const head = input.head ? normalizeHostedReviewHeadRef(input.head) || undefined : undefined
  const title = input.title.trim()
  if (!base || !title) {
    return {
      ok: false,
      code: 'validation',
      error: 'Create PR failed: base branch and title are required.'
    }
  }
  if (head && head.toLowerCase() === base.toLowerCase()) {
    return {
      ok: false,
      code: 'validation',
      error: 'Create PR failed: choose a different base branch before creating a pull request.'
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'yiru-pr-body-'))
  await acquire()
  const bodyPath = join(tempDir, 'body.md')
  try {
    const body =
      input.useTemplate && !input.body?.trim()
        ? await readPullRequestTemplate(repoPath)
        : (input.body ?? '')
    await writeFile(bodyPath, body, 'utf8')
    const createArgs = [
      'pr',
      'create',
      '--repo',
      repoArg,
      '--base',
      base,
      '--title',
      title,
      '--body-file',
      bodyPath
    ]
    if (head) {
      createArgs.push('--head', head)
    }
    if (input.draft) {
      createArgs.push('--draft')
    }
    try {
      const context = githubRepoContext(repoPath, connectionId)
      const { stdout } = await ghExecFileAsync(createArgs, {
        ...ghRepoExecOptions(context),
        ...(connectionId ? {} : getHostedReviewLocalGitOptions(options)),
        timeout: 60_000,
        idempotent: false
      })
      const created = parseCreatePRPayload(stdout)
      if (created) {
        return { ok: true, ...created }
      }
      const found = head
        ? await findOpenPRByHeadBase({
            repoPath,
            repoArg,
            head,
            base,
            connectionId,
            options
          }).catch(() => null)
        : null
      if (found) {
        return { ok: true, ...found }
      }
      return {
        ok: false,
        code: 'unknown_completion',
        error: 'PR creation may have completed. Refreshing branch review state...'
      }
    } catch (error) {
      const classified = classifyCreatePRError(error)
      if (
        !classified.ok &&
        (classified.code === 'already_exists' || classified.code === 'unknown_completion') &&
        head
      ) {
        const existing = await findOpenPRByHeadBase({
          repoPath,
          repoArg,
          head,
          base,
          connectionId,
          options
        }).catch(() => null)
        if (existing) {
          return {
            ok: false,
            code: 'already_exists',
            error: 'A pull request already exists for this branch.',
            existingReview: existing
          }
        }
      }
      return classified
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    release()
  }
}
