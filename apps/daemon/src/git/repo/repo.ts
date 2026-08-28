export {
  DEFAULT_BASE_REF_PROBES,
  getBaseRefDefault,
  getDefaultBaseRef,
  resolveDefaultBaseRefViaExec,
  resolveDefaultBaseRefWithLocalGit,
  type GitExec
} from './default-base-ref'
export { getGitRepoRoot, isGitRepo, normalizeGitRepoRootForInputPath } from './repo-detection'
export {
  getRecentDriftSubjects,
  getRemoteCount,
  getRemoteDrift,
  getRemoteUrl,
  getRepoName,
  parseRemoteCount
} from './repo-details'
export {
  buildSearchBaseRefsArgv,
  isForEachRefExcludeUnsupportedError,
  mergeBaseRefSearchResultGroups
} from './base-ref-search-query'
export {
  getBranchConflictKind,
  getDefaultRemote,
  normalizeRefSearchQuery,
  parseAndFilterSearchRefDetails,
  searchBaseRefDetails,
  type BranchConflictKind
} from './base-ref-search'
export { getRemoteCommitUrl, getRemoteFileUrl } from './hosted-repo-links'
