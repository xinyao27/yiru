import { ArrowLeft } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

import type { AddRepoDialogStep } from './add-repo-dialog-types'

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
    step === 'clone' ||
    step === 'remote' ||
    step === 'server-path' ||
    step === 'create' ||
    step === 'nested'

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
        <ArrowLeft weight="regular" className="size-3" />
        {translate('auto.components.sidebar.AddRepoStepIndicator.3bb655c117', 'Back')}
      </Button>
    </div>
  )
}
