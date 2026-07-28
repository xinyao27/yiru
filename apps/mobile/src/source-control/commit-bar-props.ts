export type MobileSourceControlCommitBarProps = {
  commitMessage: string
  generateDisabled: boolean
  generatingMessage: boolean
  hasStagedFiles: boolean
  inputDisabled: boolean
  isCreatePrAction: boolean
  onChangeText: (value: string) => void
  onGenerate: () => void
  onPrimaryAction: () => void
  primaryAccessibilityHint?: string
  primaryAccessibilityLabel: string
  primaryDisabled: boolean
  primaryLabel: string
  primaryLoading: boolean
  showGenerateButton: boolean
}
