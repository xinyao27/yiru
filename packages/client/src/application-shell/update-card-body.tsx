import type { ChangelogData, UpdateStatus } from '@yiru/runtime-protocol/workbench/types'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'

import {
  UpdateCardCompactContent,
  UpdateCardDownloadingContent,
  UpdateCardReadyContent,
  UpdateCardRichContent,
  UpdateCardSimpleContent
} from './update-card-content'
import { UpdateCardErrorContent } from './update-card-error-content'
import { updateReleaseUrl, type UpdateErrorCardModel } from './update-card-model'

export function UpdateCardBody(props: {
  status: UpdateStatus
  changelog: ChangelogData | null
  errorCard: UpdateErrorCardModel | null
  startedDownload: boolean
  prefersReducedMotion: boolean
  mediaFailed: boolean
  mediaLoaded: boolean
  onMediaError: () => void
  onMediaLoad: () => void
  onUpdate: () => void
  onInstallRetry: () => void
  onDismiss: () => void
  onCollapse: () => void
}): JSX.Element | null {
  if (props.status.state === 'checking') {
    return (
      <UpdateCardCompactContent
        icon="spinner"
        text={translate('auto.components.UpdateCard.ba5ffc949c', 'Checking for updates...')}
      />
    )
  }
  if (props.status.state === 'not-available') {
    return (
      <UpdateCardCompactContent
        icon="check"
        text={translate('auto.components.UpdateCard.ea2a41adbe', "You're on the latest version.")}
      />
    )
  }
  if (props.errorCard) {
    return <UpdateCardErrorContent {...props.errorCard} onClose={props.onCollapse} />
  }
  if (props.status.state === 'downloaded') {
    if (props.startedDownload) {
      return (
        <div className="p-4">
          <p className="text-sm">
            {translate('auto.components.UpdateCard.09a55c39b5', 'Installing...')}
          </p>
        </div>
      )
    }
    return (
      <UpdateCardReadyContent
        version={props.status.version}
        onRestart={props.onInstallRetry}
        onClose={props.onCollapse}
      />
    )
  }
  if (props.status.state === 'downloading') {
    return (
      <UpdateCardDownloadingContent
        version={props.status.version}
        percent={props.status.percent}
        changelog={props.changelog}
        prefersReducedMotion={props.prefersReducedMotion}
        mediaFailed={props.mediaFailed}
        mediaLoaded={props.mediaLoaded}
        onMediaError={props.onMediaError}
        onMediaLoad={props.onMediaLoad}
        onCollapse={props.onCollapse}
      />
    )
  }
  if (props.status.state !== 'available') {
    return null
  }
  if (props.changelog?.release) {
    return (
      <UpdateCardRichContent
        release={props.changelog.release}
        releasesBehind={props.changelog.releasesBehind}
        prefersReducedMotion={props.prefersReducedMotion}
        mediaFailed={props.mediaFailed}
        mediaLoaded={props.mediaLoaded}
        onMediaError={props.onMediaError}
        onMediaLoad={props.onMediaLoad}
        onUpdate={props.onUpdate}
        onClose={props.onDismiss}
      />
    )
  }
  return (
    <UpdateCardSimpleContent
      version={props.status.version}
      releaseUrl={props.status.releaseUrl ?? updateReleaseUrl(props.status.version)}
      onUpdate={props.onUpdate}
      onClose={props.onDismiss}
    />
  )
}
