import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import {
  requestWorktreeNavigation,
  useHasWorktreeNavigationTargets
} from '~renderer/components/sidebar/worktree-navigation-request'
import { Button } from '~renderer/components/ui/button'
import {
  useShortcutKeyDetails,
  type ShortcutKeyComboDetails
} from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'

type LandingShortcut = {
  disabled: boolean
  id: string
  label: string
  onClick: () => void
  shortcut: ShortcutKeyComboDetails
}

type LandingShortcutsProps = {
  canCreateWorktree: boolean
  createTargetLabel: string
  onCreate: () => void
}

export function LandingShortcuts(props: LandingShortcutsProps): React.JSX.Element {
  const { canCreateWorktree, createTargetLabel, onCreate } = props
  const hasNavigationTargets = useHasWorktreeNavigationTargets()
  const createWorktreeShortcut = useShortcutKeyDetails('workspace.create')
  const previousWorktreeShortcut = useShortcutKeyDetails('worktree.navigateUp')
  const nextWorktreeShortcut = useShortcutKeyDetails('worktree.navigateDown')
  const shortcuts = [
    {
      id: 'create',
      shortcut: createWorktreeShortcut,
      label: translate('auto.components.Landing.createShortcut', 'Create {{value0}}', {
        value0: createTargetLabel.toLowerCase()
      }),
      disabled: !canCreateWorktree,
      onClick: onCreate
    },
    {
      id: 'up',
      shortcut: previousWorktreeShortcut,
      label: translate('auto.components.Landing.previousWorkspace', 'Move up workspace'),
      disabled: !hasNavigationTargets,
      onClick: () => requestWorktreeNavigation('up')
    },
    {
      id: 'down',
      shortcut: nextWorktreeShortcut,
      label: translate('auto.components.Landing.nextWorkspace', 'Move down workspace'),
      disabled: !hasNavigationTargets,
      onClick: () => requestWorktreeNavigation('down')
    }
  ] satisfies LandingShortcut[]

  return (
    <ul className="mt-6 w-full max-w-xs space-y-1">
      {shortcuts.map((shortcut) => (
        <li key={shortcut.id}>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="w-full justify-between"
            disabled={shortcut.disabled}
            onClick={shortcut.onClick}
          >
            <span className="truncate">{shortcut.label}</span>
            <ShortcutKeyCombo
              keys={shortcut.shortcut.keys}
              doubleTap={shortcut.shortcut.doubleTap}
              separatorClassName="mx-0.5 text-[10px] text-muted-foreground"
            />
          </Button>
        </li>
      ))}
    </ul>
  )
}
