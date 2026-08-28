import { translate } from '~renderer/i18n/i18n'
import { DialogDescription } from '~renderer/ui/dialog'

export function DeleteWorktreeDialogDescription({
  targetClassName,
  targetLabel,
  canDeleteAllLineage,
  childTargetLabel,
  descriptionSuffix
}: {
  targetClassName: string
  targetLabel: string | undefined
  canDeleteAllLineage: boolean
  childTargetLabel: string
  descriptionSuffix: string
}): React.JSX.Element {
  return (
    <DialogDescription className="text-xs">
      {translate('auto.components.sidebar.DeleteWorktreeDialog.91492c9ad6', 'Remove')}{' '}
      <span className={targetClassName}>{targetLabel}</span>
      {canDeleteAllLineage ? (
        <>
          {' '}
          {translate('auto.components.sidebar.DeleteWorktreeDialog.ff2a74ac0e', 'and')}{' '}
          <span className="text-foreground font-medium">{childTargetLabel}</span>{' '}
          {descriptionSuffix}
        </>
      ) : (
        <> {descriptionSuffix}</>
      )}
    </DialogDescription>
  )
}
