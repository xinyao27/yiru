import {
  acquire,
  release,
  getOwnerRepo,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'
import { fetchPullRequestWorkItem } from './work-item-fetch'
import type { MainWorkItem } from './work-item-mapping'

export async function getWorkItem(
  repoPath: string,
  number: number,
  type?: 'pr',
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<MainWorkItem | null> {
  if (type !== undefined && type !== 'pr') {
    return null
  }
  await acquire()
  try {
    return await fetchPullRequestWorkItem(
      repoPath,
      await getOwnerRepo(repoPath, connectionId, localGitOptions),
      number,
      connectionId,
      localGitOptions
    )
  } catch {
    return null
  } finally {
    release()
  }
}

export async function getWorkItemByOwnerRepo(
  repoPath: string,
  ownerRepo: OwnerRepo,
  number: number,
  type: 'pr',
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<MainWorkItem | null> {
  if (type !== 'pr') {
    return null
  }
  await acquire()
  try {
    return await fetchPullRequestWorkItem(
      repoPath,
      ownerRepo,
      number,
      connectionId,
      localGitOptions
    )
  } catch {
    return null
  } finally {
    release()
  }
}
