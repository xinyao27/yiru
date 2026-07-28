import { memo, useRef, useState } from 'react'
import { Text } from 'react-native'

import { MobileGlassSection } from '../../components/glass/section'
import type { MobileChatPermission } from './permission'
import { MobileNativeChatPermissionActions } from './permission-actions'

type MobileNativeChatPermissionProps = {
  permission: MobileChatPermission
  onRespond: (send: string) => Promise<boolean>
}

function MobileNativeChatPermissionImpl({
  permission,
  onRespond
}: MobileNativeChatPermissionProps): React.JSX.Element {
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const respond = async (send: string): Promise<void> => {
    if (submittingRef.current) {
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    const accepted = await onRespond(send)
    if (!accepted) {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  return (
    <MobileGlassSection className="mx-4 my-2 gap-2 p-3">
      <Text className="text-foreground text-sm font-semibold">{permission.title}</Text>
      {permission.detail ? (
        <Text className="text-muted-foreground text-xs leading-5">{permission.detail}</Text>
      ) : null}
      <MobileNativeChatPermissionActions
        disabled={submitting}
        options={permission.options}
        onRespond={(send) => void respond(send)}
      />
    </MobileGlassSection>
  )
}

export const MobileNativeChatPermission = memo(MobileNativeChatPermissionImpl)
