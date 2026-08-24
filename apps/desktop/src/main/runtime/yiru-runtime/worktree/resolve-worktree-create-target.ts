import {
  getBaseRefDefault,
  getBranchConflictKind,
  resolveDefaultBaseRefWithLocalGit
} from '~main/git/repo'
import { resolveLocalGitUsername } from '~main/git/username'
import {
  getLocalProjectGitExecOptions,
  getLocalProjectWorktreeGitOptions
} from '~main/project-runtime-git-options'
import { resolveWorktreeCreateBase } from '~main/worktree-create-base'
import {
  getBranchNameOverrideCandidate,
  getWorktreeCreateCandidate,
  WORKTREE_CREATE_MAX_SUFFIX_ATTEMPTS
} from '~main/worktree-create-candidates'
import {
  computeWorkspaceRoot,
  computeWorktreePath,
  ensurePathWithinWorkspace,
  getWorktreePathSettings,
  sanitizeWorktreeName
} from '~main/worktree/logic'

import type {
  ManagedWorktreeBranchContext,
  ManagedWorktreeStartupContext
} from '../model/managed-worktree-create'
import {
  canCheckoutExistingLocalBranch,
  getLocalGitHubPrForBranch,
  getSelectedHostedReviewForBranch,
  getSelectedReviewBranch,
  hasLocalGitOptions,
  isAllowedPushTargetRemoteConflict,
  isMatchingSelectedGitHubPr,
  pathExists,
  resolveCreateBranchName
} from '../model/review-branch'
import { hasLocalWorktreeBaseRef } from '../model/worktree-resolution'
import { RuntimeWorktreeCreateFolderWorkspace } from './create-folder-workspace'

export abstract class RuntimeWorktreeResolveWorktreeCreateTarget extends RuntimeWorktreeCreateFolderWorkspace {
  protected async resolveWorktreeCreateTarget(
    context: ManagedWorktreeStartupContext
  ): Promise<ManagedWorktreeBranchContext> {
    const { args, repo, settings } = context
    const lineageInput =
      args.lineage || args.comment ? { ...args.lineage, comment: args.comment } : undefined
    const lineageResolution = await this.resolveLineageForWorktreeCreate(lineageInput)
    const worktreePathSettings = getWorktreePathSettings(repo, settings)
    const localGitExecOptions = getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const hasLocalWorktreeGitOptions = hasLocalGitOptions(localWorktreeGitOptions)
    const localWorktreeGitOptionArgs: [] | [{ wslDistro?: string }] = hasLocalWorktreeGitOptions
      ? [localWorktreeGitOptions]
      : []
    const hostedReviewExecutionContext = this.getHostedReviewExecutionOptions(repo)
    let effectiveRequestedName = args.name
    const requestedDisplayName = args.displayName?.trim() || undefined
    const sanitizedName = sanitizeWorktreeName(args.name)
    let effectiveSanitizedName = sanitizedName
    const username =
      !args.branchNameOverride && settings.branchPrefix === 'git-username'
        ? await resolveLocalGitUsername(repo.path)
        : ''
    const baseBranch = await resolveWorktreeCreateBase({
      requestedBaseBranch: args.baseBranch,
      repoWorktreeBaseRef: repo.worktreeBaseRef,
      resolveDefaultBaseRef: () =>
        hasLocalWorktreeGitOptions
          ? resolveDefaultBaseRefWithLocalGit(localGitExecOptions)
          : getBaseRefDefault(repo.path),
      isBaseUsable: async (candidate) => {
        const remoteTrackingBase = await this.resolveRemoteTrackingBase(
          repo.path,
          candidate,
          ...localWorktreeGitOptionArgs
        )
        if (remoteTrackingBase) {
          if (
            await this.hasRemoteTrackingRef(
              repo.path,
              remoteTrackingBase,
              ...localWorktreeGitOptionArgs
            )
          ) {
            return true
          }
        }
        return hasLocalWorktreeBaseRef(
          repo.path,
          candidate,
          hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
        )
      }
    })
    if (!baseBranch) {
      throw new Error(
        'Could not resolve a default base ref for this repo. Pass an explicit --base and try again.'
      )
    }

    const workspaceRoot = computeWorkspaceRoot(repo.path, worktreePathSettings)
    let branchName = ''
    let checkoutExistingBranch = false
    let selectedExistingLocalBranchName: string | null = null
    let branchConflictKind: 'local' | 'remote' | null = null
    let worktreePath = ''
    let worktreePathResolved = false
    for (let suffix = 1; suffix <= WORKTREE_CREATE_MAX_SUFFIX_ATTEMPTS; suffix += 1) {
      effectiveSanitizedName = getWorktreeCreateCandidate(sanitizedName, suffix)
      effectiveRequestedName = args.name.trim()
        ? getWorktreeCreateCandidate(args.name, suffix)
        : effectiveSanitizedName
      branchName = await resolveCreateBranchName(
        repo.path,
        selectedExistingLocalBranchName ??
          getBranchNameOverrideCandidate(args.branchNameOverride, suffix),
        effectiveSanitizedName,
        settings,
        username,
        localWorktreeGitOptions
      )
      checkoutExistingBranch = await canCheckoutExistingLocalBranch(
        repo.path,
        branchName,
        baseBranch,
        ...localWorktreeGitOptionArgs
      )
      if (checkoutExistingBranch && !selectedExistingLocalBranchName) {
        selectedExistingLocalBranchName = branchName
      }
      branchConflictKind = checkoutExistingBranch
        ? null
        : await getBranchConflictKind(
            repo.path,
            branchName,
            baseBranch,
            ...localWorktreeGitOptionArgs
          )
      let selectedReviewConflictMatched = false
      if (
        branchConflictKind &&
        isAllowedPushTargetRemoteConflict(branchConflictKind, branchName, args)
      ) {
        const selectedReview = getSelectedReviewBranch(args)
        if (selectedReview?.provider === 'github') {
          const existingPR = await getLocalGitHubPrForBranch(
            repo.path,
            branchName,
            localWorktreeGitOptions
          ).catch(() => null)
          if (isMatchingSelectedGitHubPr(existingPR, args, branchName)) {
            branchConflictKind = null
            selectedReviewConflictMatched = true
          }
        } else if (selectedReview) {
          const review = await getSelectedHostedReviewForBranch(
            repo,
            branchName,
            args,
            hostedReviewExecutionContext
          ).catch(() => null)
          if (review?.matchesSelected) {
            branchConflictKind = null
            selectedReviewConflictMatched = true
          }
        }
      }
      if (branchConflictKind) {
        continue
      }
      if (!checkoutExistingBranch && !selectedReviewConflictMatched) {
        const existingPR = await getLocalGitHubPrForBranch(
          repo.path,
          branchName,
          localWorktreeGitOptions
        ).catch(() => null)
        if (existingPR && !isMatchingSelectedGitHubPr(existingPR, args, branchName)) {
          continue
        }
      }
      worktreePath = ensurePathWithinWorkspace(
        computeWorktreePath(effectiveSanitizedName, repo.path, worktreePathSettings),
        workspaceRoot
      )
      if (!(await pathExists(worktreePath))) {
        worktreePathResolved = true
        break
      }
    }
    if (!worktreePathResolved) {
      if (branchConflictKind) {
        throw new Error(
          `Branch "${branchName}" already exists ${branchConflictKind === 'local' ? 'locally' : 'on a remote'}.`
        )
      }
      throw new Error(
        `Could not find an available worktree path for "${sanitizedName}". Pick a different worktree name.`
      )
    }
    return {
      ...context,
      lineageInput,
      lineageResolution,
      localWorktreeGitOptions,
      baseBranch,
      branchName,
      checkoutExistingBranch,
      worktreePath,
      effectiveRequestedName,
      effectiveSanitizedName,
      requestedDisplayName
    }
  }
}
