export type ComposerCreateGateInput = {
  repoId: string
  workspaceSeedName: string
  creating: boolean
  shouldWaitForSetupCheck: boolean
  requiresExplicitSetupChoice: boolean
  hasSetupDecision: boolean
  selectedRepoRequiresConnection: boolean
  sparseError: string | null
}

function hasBlockingCreateState(input: ComposerCreateGateInput): boolean {
  return (
    !input.workspaceSeedName ||
    input.creating ||
    input.selectedRepoRequiresConnection ||
    (input.requiresExplicitSetupChoice && !input.hasSetupDecision) ||
    input.sparseError !== null
  )
}

export function getFullComposerCreateDisabled(input: ComposerCreateGateInput): boolean {
  return hasBlockingCreateState(input) || input.shouldWaitForSetupCheck
}

export function getQuickComposerCreateDisabled(input: ComposerCreateGateInput): boolean {
  // Why: Cmd/Ctrl+N quick create resolves setup hooks inside submit. Keeping
  // that background probe out of the disabled gate makes the primary action usable
  // as soon as the form has enough local state to submit.
  return hasBlockingCreateState(input)
}
