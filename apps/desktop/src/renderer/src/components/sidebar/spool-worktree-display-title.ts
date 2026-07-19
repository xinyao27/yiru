import { translate } from '@/i18n/i18n'

export function getSpoolWorktreeDisplayTitle(
  ownerDisplayName: string,
  worktreeName: string
): string {
  return translate(
    'auto.components.sidebar.SpoolWorktreeRow.ownerTitle',
    "{{value0}}'s {{value1}}",
    { value0: ownerDisplayName, value1: worktreeName }
  )
}
