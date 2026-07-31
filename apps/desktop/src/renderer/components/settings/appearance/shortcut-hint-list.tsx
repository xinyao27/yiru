import type React from 'react'
import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import type { ShortcutKeyComboDetails } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'

/** Renders the primary keyboard shortcut combo inline, or an "Unassigned"
 *  hint when the action has no binding. Platform-aware glyphs come from
 *  ShortcutKeyCombo. */
export function ShortcutHintList({
  combos
}: {
  combos: ShortcutKeyComboDetails[]
}): React.JSX.Element {
  if (combos.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">
        {translate('auto.components.settings.AppearancePane.3057983501', 'Unassigned')}
      </span>
    )
  }
  const primaryCombo = combos[0]

  return (
    <span className="inline-flex items-center align-middle">
      <ShortcutKeyCombo
        keys={primaryCombo.keys}
        doubleTap={primaryCombo.doubleTap}
        className="inline-flex gap-0.5"
        separatorClassName="text-[10px] text-muted-foreground"
      />
    </span>
  )
}
