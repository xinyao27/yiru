import { useLocalSearchParams } from 'expo-router'

import { normalizeMobileFilePreviewRouteParams } from '../../../../../src/files/mobile-file-preview-route'
import { MobileFilePreviewScreen } from '../../../../../src/files/mobile-file-preview-screen'

export default function MobileFilePreviewRoute() {
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    worktreeId?: string | string[]
    relativePath?: string | string[]
    source?: string | string[]
    absolutePath?: string | string[]
    grantId?: string | string[]
    line?: string | string[]
    column?: string | string[]
    name?: string | string[]
    worktreeName?: string | string[]
  }>()
  return <MobileFilePreviewScreen route={normalizeMobileFilePreviewRouteParams(params)} />
}
