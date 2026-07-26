import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import { memo, useState } from 'react'
import { toast } from 'sonner'

import type {
  SessionOptionDescriptor,
  SessionOptionsSurface,
  SessionOptionValue
} from '../../../../../shared/native-chat/session-options'
import { translate } from '../../../i18n/i18n'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip'
import {
  nativeChatModelPillLabel,
  nativeChatOptionsPillLabel,
  nativeChatOptionsPillTitle,
  nativeChatSessionChoiceLabel,
  nativeChatSessionOptionDisabledReason,
  nativeChatSessionOptionLabel
} from './option-labels'

export type NativeChatSessionOptionPickersProps = {
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
  isWorking: boolean
  /** Why: some agents only accept a model or effort change as a launch flag, so
   *  the only honest way to switch is starting a new session with those flags. */
  onRelaunchSession?: () => void
}

const CATEGORY_ORDER: Record<string, number> = {
  thought_level: 0,
  model_config: 1,
  mode: 2
}

function sortedOptions(snapshot: readonly SessionOptionDescriptor[]): SessionOptionDescriptor[] {
  return snapshot
    .filter((descriptor) => descriptor.category !== 'model')
    .sort((left, right) => {
      const leftOrder = CATEGORY_ORDER[left.category ?? ''] ?? 3
      const rightOrder = CATEGORY_ORDER[right.category ?? ''] ?? 3
      return leftOrder - rightOrder
    })
}

function PickerTooltipContent(props: {
  label: string
  disabledReason?: string | null
  dispatched: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <div>{props.disabledReason ?? props.label}</div>
      {props.dispatched ? (
        <div>
          {translate(
            'components.native-chat.composer.sentNotConfirmed',
            'Sent to the agent — not confirmed'
          )}
        </div>
      ) : null}
    </div>
  )
}

function PickerTrigger(props: {
  label: string
  tooltipLabel: string
  disabled: boolean
  disabledReason?: string | null
  dispatched: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <DropdownMenuTrigger
            disabled={props.disabled}
            render={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={props.tooltipLabel}
                className="text-muted-foreground max-w-48"
              >
                <span className="truncate">{props.label}</span>
                <ChevronDown weight="regular" className="size-3" />
              </Button>
            }
          />
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        <PickerTooltipContent
          label={props.tooltipLabel}
          disabledReason={props.disabledReason}
          dispatched={props.dispatched}
        />
      </TooltipContent>
    </Tooltip>
  )
}

function ChoiceBody(props: { label: string; description?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 py-0.5">
      <div>{props.label}</div>
      {props.description ? (
        <div className="text-muted-foreground text-xs font-normal">{props.description}</div>
      ) : null}
    </div>
  )
}

function actionLabel(descriptor: SessionOptionDescriptor): string {
  if (descriptor.action?.type === 'agent-picker') {
    return translate(
      'components.native-chat.composer.chooseInAgentPicker',
      'Choose in agent picker…'
    )
  }
  return translate('components.native-chat.composer.toggleOption', 'Toggle {{value0}}', {
    value0: nativeChatSessionOptionLabel(descriptor).toLowerCase()
  })
}

function DescriptorMenuRows(props: {
  descriptor: SessionOptionDescriptor
  pending: boolean
  setValue: (value: SessionOptionValue) => void
  /** Why: with a relaunch entry available, handing off to the agent's own TUI
   *  picker is a second, worse answer to the same question. */
  suppressAgentPicker?: boolean
}): React.JSX.Element | null {
  const { descriptor, pending, setValue, suppressAgentPicker } = props
  if (descriptor.action) {
    if (descriptor.action.type === 'agent-picker' && suppressAgentPicker) {
      return null
    }
    return (
      <DropdownMenuItem
        disabled={!descriptor.settable || pending}
        // Why: Base UI menu items fire onClick; onSelect is only a DOM
        // text-selection event here, so it type-checks but never runs.
        onClick={() =>
          setValue(
            descriptor.kind.type === 'boolean'
              ? !(descriptor.kind.currentValue ?? false)
              : (descriptor.kind.currentValue ?? '')
          )
        }
      >
        {actionLabel(descriptor)}
      </DropdownMenuItem>
    )
  }
  if (descriptor.kind.type === 'boolean') {
    return (
      <DropdownMenuCheckboxItem
        checked={descriptor.kind.currentValue ?? false}
        disabled={!descriptor.settable || pending}
        onCheckedChange={(checked) => setValue(checked === true)}
      >
        {nativeChatSessionOptionLabel(descriptor)}
      </DropdownMenuCheckboxItem>
    )
  }
  return (
    <DropdownMenuRadioGroup
      value={descriptor.kind.currentValue}
      onValueChange={(value) => setValue(value)}
    >
      {descriptor.kind.choices.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.value}
          value={choice.value}
          disabled={!descriptor.settable || pending}
        >
          <ChoiceBody
            label={nativeChatSessionChoiceLabel(choice)}
            description={choice.description}
          />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function NativeChatSessionOptionPickersInner({
  surface,
  snapshot,
  isWorking,
  onRelaunchSession
}: NativeChatSessionOptionPickersProps): React.JSX.Element | null {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const model = snapshot.find((descriptor) => descriptor.category === 'model')
  const options = sortedOptions(snapshot)
  if (!surface || !model) {
    return null
  }

  const setOption = (descriptor: SessionOptionDescriptor, value: SessionOptionValue): void => {
    setPendingId(descriptor.id)
    void surface
      .setOption(descriptor.id, value)
      .catch((error) => {
        toast.error(
          translate(
            'components.native-chat.composer.optionUpdateFailed',
            'Could not update option'
          ),
          { description: error instanceof Error ? error.message : String(error) }
        )
      })
      .finally(() => setPendingId(null))
  }

  const modelRowsSuppressed = Boolean(onRelaunchSession) && model.action?.type === 'agent-picker'
  const modelReason = nativeChatSessionOptionDisabledReason(model.disabledReason)
  const modelTooltip = translate('components.native-chat.composer.model', 'Model')
  const optionsTooltip = nativeChatOptionsPillTitle(options)
  const optionsReason =
    options.length > 0 && options.every((descriptor) => !descriptor.settable)
      ? nativeChatSessionOptionDisabledReason(options[0]?.disabledReason)
      : null

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {options.length > 0 ? (
        <DropdownMenu>
          <PickerTrigger
            label={nativeChatOptionsPillLabel(options)}
            tooltipLabel={optionsTooltip}
            disabled={isWorking || pendingId !== null}
            disabledReason={optionsReason}
            dispatched={options.some((descriptor) => descriptor.valueSource === 'dispatched')}
          />
          <DropdownMenuContent align="start" className="w-60">
            {options.map((descriptor, index) => {
              const reason = nativeChatSessionOptionDisabledReason(descriptor.disabledReason)
              return (
                <div key={descriptor.id}>
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel>{nativeChatSessionOptionLabel(descriptor)}</DropdownMenuLabel>
                  {reason && !descriptor.settable ? (
                    <DropdownMenuLabel className="font-normal">{reason}</DropdownMenuLabel>
                  ) : null}
                  <DescriptorMenuRows
                    descriptor={descriptor}
                    pending={pendingId !== null}
                    setValue={(value) => setOption(descriptor, value)}
                    suppressAgentPicker={Boolean(onRelaunchSession)}
                  />
                </div>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <PickerTrigger
          label={nativeChatModelPillLabel(model)}
          tooltipLabel={modelTooltip}
          disabled={isWorking || pendingId !== null}
          disabledReason={modelReason}
          dispatched={model.valueSource === 'dispatched'}
        />
        <DropdownMenuContent align="start" className="w-64">
          {modelReason && !model.settable ? (
            <DropdownMenuLabel className="font-normal">{modelReason}</DropdownMenuLabel>
          ) : null}
          <DescriptorMenuRows
            descriptor={model}
            pending={pendingId !== null}
            setValue={(value) => setOption(model, value)}
            suppressAgentPicker={Boolean(onRelaunchSession)}
          />
          {onRelaunchSession ? (
            <>
              {modelRowsSuppressed ? null : <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={onRelaunchSession}>
                {translate(
                  'components.native-chat.composer.relaunchWithOtherAgent',
                  'Switch Agent or model…'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export const NativeChatSessionOptionPickers = memo(NativeChatSessionOptionPickersInner)
