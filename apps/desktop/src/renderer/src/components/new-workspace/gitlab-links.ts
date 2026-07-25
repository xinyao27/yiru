// Re-export shim: the implementation moved to src/shared so mobile can share it.
export {
  normalizeGitLabMergeRequestQuery,
  parseGitLabMergeRequestLink,
  parseGitLabMergeRequestNumber,
  type GitLabMergeRequestQuery,
  type ProjectSlug
} from '@yiru/workbench-model/review'
