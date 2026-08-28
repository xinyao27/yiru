// Why: local multi-profile management remains opt-in while its product scope is
// finalized; this is a UI rollout toggle, not a security boundary.
export function isMultiProfileUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.YIRU_MULTI_PROFILE_UI === '1'
}
