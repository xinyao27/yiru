// Compatibility export: the implementation lives in runtime-protocol so mobile can share it.
export {
  normalizeGitLabMergeRequestQuery,
  parseGitLabMergeRequestLink,
  parseGitLabMergeRequestNumber,
  type GitLabMergeRequestQuery,
  type ProjectSlug
} from '@yiru/runtime-protocol/model/review'
