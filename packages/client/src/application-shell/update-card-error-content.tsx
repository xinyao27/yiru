import type { JSX } from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  WarningCircle as AlertCircle,
  Minus,
  Network,
  ArrowClockwise as RotateCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'

import { Button } from '../ui/button'
import type { UpdateErrorCardModel } from './update-card-model'

export function UpdateCardErrorContent(
  props: UpdateErrorCardModel & { onClose: () => void }
): JSX.Element {
  const isCompatibility = props.variant === 'http1Compatibility'
  const Icon = isCompatibility ? Network : AlertCircle
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="border-border bg-muted/50 text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center border">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold">{props.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{props.summary}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-m-2 size-7 min-h-[44px] min-w-[44px] shrink-0"
          onClick={props.onClose}
          aria-label={translate('auto.components.UpdateCard.8acbdd3961', 'Minimize to status bar')}
        >
          <Minus className="size-3.5" />
        </Button>
      </div>

      {isCompatibility ? (
        <div className="border-border/70 bg-muted/30 border px-3 py-2">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {translate(
              'auto.components.UpdateCard.90559b14e3',
              'This turns on a process-wide Electron networking switch after restart. Use it for corporate VPNs or proxies that reject HTTP/2 update downloads.'
            )}
          </p>
        </div>
      ) : null}

      <div className="bg-muted/40 px-3 py-2">
        <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase">
          {translate('auto.components.UpdateCard.3553a8672f', 'Last error')}
        </p>
        <p className="scrollbar-sleek text-muted-foreground max-h-20 overflow-auto font-mono text-xs leading-relaxed break-words">
          {props.message}
        </p>
      </div>

      <div className="flex gap-2">
        {props.primaryAction ? (
          <Button
            variant="default"
            size="sm"
            onClick={props.primaryAction.onClick}
            disabled={props.primaryAction.isPending}
            className="flex-1 gap-1.5"
          >
            {props.primaryAction.isPending ? (
              <LoadingIndicator className="size-3.5" />
            ) : isCompatibility ? (
              <RotateCw className="size-3.5" />
            ) : null}
            {props.primaryAction.isPending && props.primaryAction.pendingLabel
              ? props.primaryAction.pendingLabel
              : props.primaryAction.label}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => openHttpLink(props.releaseUrl, { event })}
          className={props.primaryAction ? 'flex-1' : 'w-full'}
        >
          {translate('auto.components.UpdateCard.47126bcf57', 'Download Manually')}
        </Button>
      </div>
    </div>
  )
}
