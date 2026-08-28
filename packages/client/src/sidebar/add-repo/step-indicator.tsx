import { translate } from '~renderer/i18n/i18n'
import { ArrowLeft } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import type { AddRepoDialogStep } from './dialog-types'

type AddRepoStepIndicatorProps = {
  step: AddRepoDialogStep
  isAdding: boolean
  onBack: () => void
}

export function AddRepoStepIndicator({
  step,
  isAdding,
  onBack
}: AddRepoStepIndicatorProps): React.JSX.Element | null {
  const showBack =
    step === 'clone' || step === 'server-path' || step === 'create' || step === 'nested'

  if (!showBack) {
    return null
  }

  return (
    <div className="-mt-1 flex min-h-5 items-center">
      <Button
        variant="quiet"
        size="xs"
        className="h-auto border-0 p-0 disabled:cursor-default disabled:opacity-40"
        disabled={step === 'nested' && isAdding}
        onClick={onBack}
      >
        <ArrowLeft className="size-3" />
        {translate('auto.components.sidebar.AddRepoStepIndicator.3bb655c117', 'Back')}
      </Button>
    </div>
  )
}
