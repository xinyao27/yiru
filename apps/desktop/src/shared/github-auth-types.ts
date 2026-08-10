/**
 * Shared types for `gh auth status` diagnostics surfaced to the renderer.
 */

export type GhAuthAccount = {
  host: string
  user: string
  /** True when this is the account gh would use for the next call. */
  active: boolean
  /**
   * If gh reports the credential came from an environment variable, the
   * variable's name. Null when the credential came from the keyring/file
   * config. Env-token accounts can't be refreshed by `gh auth refresh`.
   */
  envToken: 'GITHUB_TOKEN' | 'GH_TOKEN' | null
  source: 'env' | 'keyring'
  scopes: string[]
}
