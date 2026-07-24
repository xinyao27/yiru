import { Check, Copy } from '@phosphor-icons/react'

import { translate } from '@/i18n/i18n'

import { Button } from '../ui/button'
import { Label } from '../ui/label'

export function GeneratedUrlRow({
  label,
  description,
  value,
  copied,
  onCopy
}: {
  label: string
  description?: string
  value: string
  copied: boolean
  onCopy: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      <div className="border-border/60 bg-background/70 flex min-w-0 items-center gap-2 border px-2 py-1.5">
        <code className="text-muted-foreground min-w-0 flex-1 overflow-x-auto text-[11px] whitespace-nowrap">
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onCopy}
          aria-label={translate(
            'auto.components.settings.RuntimePairingGeneratedUrlRows.0495f68959',
            'Copy {{value0}}',
            { value0: label }
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </div>
  )
}

export function UnavailableUrlRow({
  label,
  description
}: {
  label: string
  description: string
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="border-border/60 border px-2 py-1.5">
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  )
}
