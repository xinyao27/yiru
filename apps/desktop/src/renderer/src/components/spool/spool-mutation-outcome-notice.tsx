import { WarningCircle as CircleAlert } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

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
      className="border-border bg-muted/40 flex shrink-0 items-center gap-2 border-b px-3 py-2"
    >
      <CircleAlert aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-xs font-medium">
          {translate(
            'auto.components.spool.SpoolMutationOutcomeNotice.title',
            'Result needs confirmation'
          )}
        </p>
        <p className="text-muted-foreground text-[11px] leading-4">{description}</p>
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
