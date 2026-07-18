import { WarningCircle as CircleAlert } from '@phosphor-icons/react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'

export function SpoolMutationOutcomeNotice({
  description,
  onDismiss
}: {
  description: string
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">
          {translate(
            'auto.components.spool.SpoolMutationOutcomeNotice.title',
            'Result needs confirmation'
          )}
        </p>
        <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onDismiss}>
        {translate(
          'auto.components.spool.SpoolMutationOutcomeNotice.dismiss',
          'Dismiss after checking'
        )}
      </Button>
    </div>
  )
}
