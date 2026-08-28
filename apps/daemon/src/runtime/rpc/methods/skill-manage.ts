import type {
  SkillDirectoryListing,
  SkillFileReadResult,
  SkillFreshnessInventory,
  SkillManageDirectoryInput,
  SkillManageFileInput,
  SkillManageInstallInput,
  SkillManageNamesInput,
  SkillManageRemoveInput,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '@yiru/runtime-protocol/contract'
import { listSkillFiles, readSkillDirectoryFile } from '~main/skills/skill-directory-access'
import {
  acknowledgeSkillUpdateRun,
  cancelSkillUpdateRun,
  getSkillUpdateRunState,
  scanSkillFreshness,
  startSkillInstallRun,
  startSkillRemoveRun,
  startSkillUpdateRun
} from '~main/skills/skills'

import type { RpcContext } from '../core'

// Why: the contract leaf has no `.input()` (freshness is a plain read), so
// oRPC infers `unknown` rather than `void` — direct wiring checks against the
// real contract shape, unlike the legacy registry's erased `params: null`.
export async function readSkillFreshnessInventory(
  _params: unknown,
  { runtime }: RpcContext
): Promise<SkillFreshnessInventory> {
  return scanSkillFreshness(runtime.listRepos())
}

// Why: update has no scope to validate, but still passes the repo list
// through — the post-run rescan needs it to judge repo-scoped skill roots.
export async function startRuntimeSkillUpdateRun(
  params: SkillManageNamesInput,
  { runtime }: RpcContext
): Promise<SkillUpdateStartResult> {
  return startSkillUpdateRun(params.names, runtime.listRepos())
}

export async function startRuntimeSkillInstallRun(
  params: SkillManageInstallInput,
  { runtime }: RpcContext
): Promise<SkillUpdateStartResult> {
  return startSkillInstallRun(params, runtime.listRepos())
}

export async function startRuntimeSkillRemoveRun(
  params: SkillManageRemoveInput,
  { runtime }: RpcContext
): Promise<SkillUpdateStartResult> {
  return startSkillRemoveRun(params, runtime.listRepos())
}

export async function readRuntimeSkillFiles(
  params: SkillManageDirectoryInput
): Promise<SkillDirectoryListing> {
  return listSkillFiles(params.directoryPath)
}

export async function readRuntimeSkillDirFile(
  params: SkillManageFileInput
): Promise<SkillFileReadResult> {
  return readSkillDirectoryFile(params)
}

export async function cancelRuntimeSkillUpdateRun(): Promise<SkillUpdateRun> {
  return cancelSkillUpdateRun()
}

export async function acknowledgeRuntimeSkillUpdateRun(): Promise<SkillUpdateRun> {
  return acknowledgeSkillUpdateRun()
}

export async function readRuntimeSkillUpdateRun(): Promise<SkillUpdateRun> {
  return getSkillUpdateRunState()
}
