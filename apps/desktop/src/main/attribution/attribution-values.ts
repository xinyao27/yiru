import { YIRU_GITHUB_REPOSITORY_URL } from '@yiru/workbench-model/product'

export const ATTRIBUTION_ROOT_DIR = 'yiru-terminal-attribution'
// Why: v8 rewrites persisted wrappers so retired issue-create attribution
// cannot survive an upgrade through an already-generated shell shim.
export const ATTRIBUTION_SHIM_VERSION = '8'
export const YIRU_GH_FOOTER = `Made with [Yiru](${YIRU_GITHUB_REPOSITORY_URL}) 🐋`
export const ATTRIBUTION_ENV_KEYS = [
  'YIRU_ENABLE_GIT_ATTRIBUTION',
  'YIRU_GIT_COMMIT_TRAILER',
  'YIRU_GH_PR_FOOTER',
  'YIRU_ATTRIBUTION_SHIM_DIR',
  'YIRU_REAL_GIT',
  'YIRU_REAL_GH'
] as const
