import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/components/ui/dialog'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

import { RemoteServerFields } from './add-remote-host-fields'

type AddRemoteHostDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddRemoteHostDialog({
  open,
  onOpenChange
}: AddRemoteHostDialogProps): React.JSX.Element {
  const [serverName, setServerName] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const setRuntimeEnvironments = useAppStore((s) => s.setRuntimeEnvironments)
  const refreshRuntimeEnvironmentStatus = useAppStore((s) => s.refreshRuntimeEnvironmentStatus)

  const close = () => {
    if (isSaving) {
      return
    }
    onOpenChange(false)
  }

  const saveRemoteServer = async () => {
    const trimmedName = serverName.trim()
    const trimmedPairingCode = pairingCode.trim()
    if (!trimmedName || !trimmedPairingCode) {
      toast.error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.serverFieldsRequired',
          'Server name and pairing code are required.'
        )
      )
      return
    }

    setIsSaving(true)
    try {
      const result = await window.api.runtimeEnvironments.addFromPairingCode({
        name: trimmedName,
        pairingCode: trimmedPairingCode
      })
      const environments = await window.api.runtimeEnvironments.list()
      setRuntimeEnvironments(environments)
      await refreshRuntimeEnvironmentStatus(result.environment.id)
      toast.success(
        translate('auto.components.sidebar.AddRemoteHostDialog.serverSaved', 'Remote server added.')
      )
      setServerName('')
      setPairingCode('')
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.sidebar.AddRemoteHostDialog.serverSaveFailed',
              'Failed to add remote server.'
            )
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close()
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.serverTitle',
              'Add remote server'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.serverDescription',
              'Pair with Yiru running on another computer.'
            )}
          </DialogDescription>
        </DialogHeader>

        <RemoteServerFields
          name={serverName}
          pairingCode={pairingCode}
          disabled={isSaving}
          onNameChange={setServerName}
          onPairingCodeChange={setPairingCode}
          onSubmit={() => void saveRemoteServer()}
        />

        <DialogFooter>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close} disabled={isSaving}>
              {translate('auto.components.sidebar.AddRemoteHostDialog.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={() => void saveRemoteServer()} disabled={isSaving}>
              {isSaving
                ? translate('auto.components.sidebar.AddRemoteHostDialog.saving', 'Saving...')
                : translate('auto.components.sidebar.AddRemoteHostDialog.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
