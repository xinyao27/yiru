import { ArrowLeft } from '@phosphor-icons/react'

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
      <button
        className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs transition-colors disabled:cursor-default disabled:opacity-40"
        disabled={step === 'nested' && isAdding}
        onClick={onBack}
      >
        <ArrowLeft className="size-3" />
        {translate('auto.components.sidebar.AddRepoStepIndicator.3bb655c117', 'Back')}
      </button>
    </div>
  )
}
