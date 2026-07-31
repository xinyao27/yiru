import type { ReactNode } from 'react'
import { Dialog, DialogContent } from '~renderer/components/ui/dialog'
import { cn } from '~renderer/lib/class-names'

import type { AddRepoDialogStep } from './dialog-types'
import { AddRepoStepIndicator } from './step-indicator'

export function AddRepoDialogChrome({
  children,
  isAdding,
  isOpen,
  onBack,
  onOpenChange,
  step
}: {
  children: ReactNode
  isAdding: boolean
  isOpen: boolean
  onBack: () => void
  onOpenChange: (open: boolean) => void
  step: AddRepoDialogStep
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'min-w-0 overflow-hidden sm:max-w-lg [&>*]:min-w-0',
          step === 'nested' ? 'max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)]' : ''
        )}
      >
        <AddRepoStepIndicator step={step} isAdding={isAdding} onBack={onBack} />
        {children}
      </DialogContent>
    </Dialog>
  )
}
