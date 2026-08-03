import { useState } from 'react'

import { AddRemoteHostDialog } from '../add-remote-host-dialog'
import { AddRepoHostSelector } from './host-selector'
import type { useAddRepoHostSelection } from './use-host-selection'

export function AddRepoHostSelectorSlot({
  hostSelection
}: {
  hostSelection: ReturnType<typeof useAddRepoHostSelection>
}) {
  const [addRemoteHostOpen, setAddRemoteHostOpen] = useState(false)

  return (
    <>
      <AddRepoHostSelector
        hosts={hostSelection.hostOptions}
        selectedHostId={hostSelection.selectedHostId}
        open={hostSelection.hostSelectorOpen}
        onOpenChange={hostSelection.setHostSelectorOpen}
        onSelectHost={(hostId) => void hostSelection.handleSelectAddProjectHost(hostId)}
        onConnectHost={(hostId) => void hostSelection.handleConnectAddProjectHost(hostId)}
        onAddRemoteServer={() => setAddRemoteHostOpen(true)}
      />
      <AddRemoteHostDialog open={addRemoteHostOpen} onOpenChange={setAddRemoteHostOpen} />
    </>
  )
}
