import { translate } from '~renderer/i18n/i18n'

export function getCoworkingWorktreeDisplayTitle(
  ownerDisplayName: string,
  worktreeName: string
): string {
  return translate(
    'auto.components.sidebar.CoworkingWorktreeRow.ownerTitle',
    "{{value0}}'s {{value1}}",
    { value0: ownerDisplayName, value1: worktreeName }
  )
}
