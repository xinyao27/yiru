import { useLocalSearchParams } from 'expo-router'

import { MobileFileExplorerPanel } from '../../../../src/files/mobile-file-explorer-panel'

export default function MobileFileExplorerScreen() {
  const { hostId, worktreeId, name } = useLocalSearchParams<{
    hostId: string
    worktreeId: string
    name?: string
  }>()
  return (
    <MobileFileExplorerPanel hostId={hostId} worktreeId={worktreeId} name={name} embedded={false} />
  )
}
