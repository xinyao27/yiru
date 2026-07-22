import {
  CaretLeft as ChevronLeft,
  ArrowElbowDownLeft as CornerDownLeft
} from '@phosphor-icons/react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { translate } from '@/i18n/i18n'

type OnboardingFooterProps = {
  shouldShowSkipToProjectSetup: boolean
  busyLabel: string | null
  onSkipToRepo: () => void
  stepIndex: number
  onBack: () => void
  showPrimary: boolean
  primaryBusy: boolean
  primaryLabel: string
  shortcutModifierLabel: string
  onPrimary: () => void
}

export function OnboardingFooter({
  shouldShowSkipToProjectSetup,
  busyLabel,
  onSkipToRepo,
  stepIndex,
  onBack,
  showPrimary,
  primaryBusy,
  primaryLabel,
  shortcutModifierLabel,
  onPrimary
}: OnboardingFooterProps): React.JSX.Element {
  return (
    <footer className="border-border mt-6 flex flex-none items-center justify-between border-t pt-5">
      {shouldShowSkipToProjectSetup ? (
        <button
          className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground focus-visible:text-foreground focus-visible:bg-accent rounded-md px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(busyLabel)}
          onClick={onSkipToRepo}
        >
          {translate(
            'auto.components.onboarding.OnboardingFooter.111d3f8d92',
            'Skip to project setup'
          )}
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {stepIndex > 0 && (
          <button
            className="border-border bg-muted/60 text-foreground hover:bg-muted focus-visible:bg-muted inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60"
            disabled={Boolean(busyLabel)}
            onClick={onBack}
          >
            <ChevronLeft className="size-4" />
            {translate('auto.components.onboarding.OnboardingFooter.ba58547306', 'Back')}
          </button>
        )}
        {showPrimary && (
          <button
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:bg-primary/90 inline-flex items-center justify-center gap-2 rounded-md px-5 py-2 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
            aria-busy={primaryBusy}
            disabled={Boolean(busyLabel)}
            onClick={onPrimary}
          >
            {primaryBusy ? <LoadingIndicator className="size-4" /> : null}
            {primaryLabel}
            <span className="border-primary-foreground/20 ml-1 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-none font-medium text-current/80">
              <span>{shortcutModifierLabel}</span>
              <CornerDownLeft className="size-3" />
            </span>
          </button>
        )}
      </div>
    </footer>
  )
}
