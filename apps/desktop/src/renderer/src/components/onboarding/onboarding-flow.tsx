import { useCallback, useEffect, useRef, useState } from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { isEditableTarget } from '@/lib/editable-target'
import { getScreenSubmitModifierLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'

import logo from '../../../../../resources/logo.svg'
import type { OnboardingState } from '../../../../shared/types'
import { AgentStep } from './agent-step'
import { IntegrationsStep } from './integrations-step'
import { NotificationStep } from './notification-step'
import { shouldRequestOnboardingSkipConfirmation } from './onboarding-dismiss-target'
import { OnboardingFooter } from './onboarding-footer'
import { OnboardingSkipConfirmationDialog } from './onboarding-skip-confirmation-dialog'
import { ThemeStep } from './theme-step'
import { useOnboardingFlow } from './use-onboarding-flow'
import { WindowsTerminalStep } from './windows-terminal-step'

const stepCopy = {
  agent: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.198b148b3c',
        'Pick your default agent'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.322fc50a18',
        "Yiru works with every CLI agent. Choose the one you'll reach for most. Switch any time."
      )
    }
  },
  theme: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.f396db9f20',
        'Make it feel like home'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.04ae28d8ca',
        'Pick the look you want to stare at for hours.'
      )
    }
  },
  notifications: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.b054332836',
        'Set up notifications'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ff92d15436',
        'Yiru will notify you when agents are done or need help.'
      )
    }
  },
  integrations: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ae3b00ca82',
        'Set up GitHub reviews'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.97c42cda00',
        'Install the GitHub CLI to:'
      )
    }
  },
  windows_terminal: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalTitle',
        'Set Windows terminal defaults'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalSubtitle',
        'Choose the DEFAULT Shell for new panes and how right-click behaves in the terminal.'
      )
    }
  }
} as const

const stepTooltipLabels = {
  agent: 'Default Agent',
  theme: 'Appearance',
  windows_terminal: 'Windows Terminal',
  notifications: 'Notifications',
  integrations: 'Integrations'
} as const

type OnboardingFlowProps = {
  onboarding: OnboardingState
  onOnboardingChange: (state: OnboardingState) => void
  onSettingsDetourStart?: () => void
}

export default function OnboardingFlow({
  onboarding,
  onOnboardingChange,
  onSettingsDetourStart
}: OnboardingFlowProps): React.JSX.Element {
  const flow = useOnboardingFlow(onboarding, onOnboardingChange, { onSettingsDetourStart })
  const continueShortcutModifierLabel = getScreenSubmitModifierLabel()
  const { currentStep, stepIndex, busyLabel } = flow
  const copy = stepCopy[currentStep.id]
  const shouldShowSkipToProjectSetup = currentStep.id !== 'notifications'
  const shouldShowFooterBusy = Boolean(busyLabel)
  const footerPrimaryLabel =
    busyLabel ?? (currentStep.id === 'notifications' ? 'Add your first project' : 'Continue')
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false)
  const skipConfirmAdvancedViaRef = useRef<'button' | 'keyboard'>('button')
  const { next: flowNext, dismissOnboarding: flowDismissOnboarding } = flow

  const requestSkipConfirmation = useCallback(
    (advancedVia: 'button' | 'keyboard') => {
      // Why: click-off / Escape dismissal stays available on every step,
      // including the final notifications step, so the modal never feels stuck.
      if (busyLabel || skipConfirmOpen) {
        return
      }
      skipConfirmAdvancedViaRef.current = advancedVia
      setSkipConfirmOpen(true)
    },
    [busyLabel, skipConfirmOpen]
  )

  const confirmSkipOnboarding = useCallback(() => {
    const advancedVia = skipConfirmAdvancedViaRef.current
    setSkipConfirmOpen(false)
    void flowDismissOnboarding(advancedVia)
  }, [flowDismissOnboarding])

  // Why: depend on stable callbacks + step id only so the listener doesn't
  // re-bind on every render of the parent (flow object identity changes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Why: don't hijack Enter / Cmd+Enter while the user is typing into the
      // clone-URL input or any other editable field on a step.
      if (isEditableTarget(event.target)) {
        return
      }
      // Why: onboarding continue is screen-local submit behavior, not a
      // user-configurable app command.
      if (!isScreenSubmitShortcut(event)) {
        return
      }
      event.preventDefault()
      void flowNext('keyboard')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [flowNext])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || skipConfirmOpen) {
        return
      }
      event.preventDefault()
      requestSkipConfirmation('keyboard')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [requestSkipConfirmation, skipConfirmOpen])

  return (
    <TooltipProvider delay={0} timeout={0}>
      <div
        className="text-foreground fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/50 p-4 backdrop-blur-[2px]"
        data-onboarding-overlay
        onPointerDown={(event) => {
          if (!shouldRequestOnboardingSkipConfirmation(event)) {
            return
          }
          requestSkipConfirmation('button')
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-8"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        <section
          ref={flow.setLifecycleRootRef}
          role="dialog"
          aria-label={translate(
            'auto.components.onboarding.OnboardingFlow.277ba45540',
            'Yiru onboarding'
          )}
          aria-modal="true"
          data-onboarding-modal
          className={cn(
            'relative flex h-[calc(100vh-2rem)] max-h-[960px] min-h-0 w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground   transition-[max-width] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            'max-w-[1100px]'
          )}
        >
          <div className="relative flex h-full min-h-0 flex-col px-6 pt-8 pb-6 sm:px-8 sm:pt-9 sm:pb-8">
            <div className="flex items-center gap-3 text-base font-semibold tracking-tight">
              <img
                src={logo}
                alt=""
                aria-hidden="true"
                className="h-7 w-auto shrink-0 invert dark:invert-0"
              />
              <span>
                {translate('auto.components.onboarding.OnboardingFlow.a249f81538', 'Yiru')}
              </span>
            </div>

            <div className="mt-10 flex items-center gap-2 transition-[margin-top] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
              {flow.progressSteps.map(({ step, index: realStepIndex }, progressIdx) => {
                const isActive = realStepIndex === stepIndex
                const isDone = realStepIndex < stepIndex
                return (
                  <Tooltip key={step.id}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            // Why: the visible bars stay 4px tall, but the invisible
                            // hit area makes hover/click/tooltip targeting reliable.
                            'relative h-1 rounded-full outline-none transition-all duration-300 before:absolute before:-inset-y-2 before:-inset-x-1 focus-visible:bg-foreground',
                            isActive
                              ? 'w-10 bg-foreground'
                              : isDone
                                ? 'w-6 bg-muted-foreground/70 hover:bg-foreground/80'
                                : 'w-6 bg-muted-foreground/25 hover:bg-muted-foreground/45'
                          )}
                          aria-label={translate(
                            'auto.components.onboarding.OnboardingFlow.adaa0aa627',
                            'Go to onboarding step {{value0}}: {{value1}}',
                            { value0: progressIdx + 1, value1: stepTooltipLabels[step.id] }
                          )}
                          aria-current={isActive ? 'step' : undefined}
                          onClick={() => flow.jumpToStep(realStepIndex)}
                        />
                      }
                    />
                    <TooltipContent side="top" sideOffset={8} style={{ zIndex: 110 }}>
                      {stepTooltipLabels[step.id]}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
              <span className="text-muted-foreground ml-3 text-xs font-medium">
                {flow.progressStepIndex + 1}{' '}
                {translate('auto.components.onboarding.OnboardingFlow.4db04f2f57', 'of')}{' '}
                {flow.progressSteps.length}
              </span>
            </div>

            <div className="mt-8 shrink-0">
              {stepIndex === 0 && (
                <div className="text-muted-foreground mb-2 text-xs font-medium tracking-[0.18em] uppercase">
                  {translate(
                    'auto.components.onboarding.OnboardingFlow.1b5e182e9f',
                    'Welcome to Yiru'
                  )}
                </div>
              )}
              <h1 className="text-foreground text-[34px] leading-[1.15] font-semibold tracking-tight">
                {copy.title}
              </h1>
              {copy.subtitle ? (
                <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
                  {copy.subtitle}
                </p>
              ) : null}
            </div>

            <div
              className={cn(
                'min-h-0 flex-1 transition-[margin-top] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                // Why: agent step pins permissions below a capped agent grid scroll
                // region; other steps keep the shared outer scroll container.
                currentStep.id === 'agent'
                  ? 'mt-10 flex flex-col overflow-hidden'
                  : cn('scrollbar-sleek overflow-y-auto pr-1', 'mt-10')
              )}
            >
              {currentStep.id === 'agent' && (
                <AgentStep
                  selectedAgent={flow.selectedAgent}
                  onSelect={flow.setSelectedAgent}
                  detectedSet={flow.detectedSet}
                  isDetecting={flow.isDetectingAgents}
                  yoloPermissions={flow.yoloPermissions}
                  onYoloPermissionsChange={flow.setYoloPermissions}
                />
              )}
              {currentStep.id === 'theme' && (
                <ThemeStep
                  theme={flow.theme}
                  onThemeChange={flow.setTheme}
                  settings={flow.settings}
                  updateSettings={flow.updateSettings}
                />
              )}
              {currentStep.id === 'notifications' && (
                <NotificationStep settings={flow.settings} updateSettings={flow.updateSettings} />
              )}
              {currentStep.id === 'integrations' && <IntegrationsStep />}
              {currentStep.id === 'windows_terminal' && (
                <WindowsTerminalStep
                  settings={flow.settings}
                  updateSettings={flow.updateSettings}
                />
              )}
            </div>

            <OnboardingFooter
              shouldShowSkipToProjectSetup={shouldShowSkipToProjectSetup}
              busyLabel={busyLabel}
              onSkipToRepo={() => void flow.skipToRepo()}
              stepIndex={stepIndex}
              onBack={flow.nestedScan ? flow.cancelNested : flow.back}
              showPrimary
              primaryBusy={shouldShowFooterBusy}
              primaryLabel={footerPrimaryLabel}
              shortcutModifierLabel={continueShortcutModifierLabel}
              onPrimary={() => void flow.next()}
            />
          </div>
        </section>
        <OnboardingSkipConfirmationDialog
          open={skipConfirmOpen}
          onOpenChange={setSkipConfirmOpen}
          onSkip={confirmSkipOnboarding}
        />
      </div>
    </TooltipProvider>
  )
}
