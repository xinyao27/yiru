import type { ChangelogData } from '@yiru/runtime-protocol/workbench/types'
import type { JSX } from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { Check, Minus, WarningCircle as AlertCircle, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button as UiButton } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import { isAnimatedUpdateMedia, updateReleaseUrl } from './update-card-model'

export function UpdateCardCompactContent(props: {
  icon: 'spinner' | 'check' | 'error'
  text: string
  onClose?: () => void
  action?: { label: string; url: string }
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="text-muted-foreground shrink-0">
        {props.icon === 'spinner' ? <LoadingIndicator className="size-4" /> : null}
        {props.icon === 'check' ? <Check className="size-4" /> : null}
        {props.icon === 'error' ? <AlertCircle className="size-4" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{props.text}</p>
        {props.action ? (
          <UiButton
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent mt-0.5 h-auto border-0 p-0 underline"
            onClick={(event) => openHttpLink(props.action?.url ?? '', { event })}
          >
            {props.action.label}
          </UiButton>
        ) : null}
      </div>
      {props.onClose ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={props.onClose}
          aria-label={translate('auto.components.UpdateCard.a726967bd3', 'Dismiss')}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

export function UpdateCardRichContent(props: {
  release: NonNullable<ChangelogData['release']>
  releasesBehind: number | null
  prefersReducedMotion: boolean
  mediaFailed: boolean
  mediaLoaded: boolean
  onMediaError: () => void
  onMediaLoad: () => void
  onUpdate: () => void
  onClose: () => void
}): JSX.Element {
  const showMedia =
    props.release.mediaUrl &&
    !props.mediaFailed &&
    !(props.prefersReducedMotion && isAnimatedUpdateMedia(props.release.mediaUrl))
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {translate('auto.components.UpdateCard.f58b5c57a6', 'New:')} {props.release.title}
        </h3>
        <DismissButton onClick={props.onClose} />
      </div>
      {showMedia ? (
        <div className="relative overflow-hidden">
          {!props.mediaLoaded ? (
            <div className="bg-muted/50 w-full animate-pulse" style={{ aspectRatio: '16/9' }} />
          ) : null}
          <img
            src={props.release.mediaUrl}
            alt=""
            className={cn('w-full', props.mediaLoaded ? '' : 'absolute inset-0')}
            style={!props.mediaLoaded ? { visibility: 'hidden' } : undefined}
            onError={props.onMediaError}
            onLoad={props.onMediaLoad}
          />
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {props.release.description}
        {props.releasesBehind !== null && props.releasesBehind > 1 ? (
          <>
            {' '}
            <UiButton
              variant="ghost"
              size="xs"
              className="text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent inline h-auto border-0 p-0 underline"
              onClick={(event) => openHttpLink(props.release.releaseNotesUrl, { event })}
            >
              +{props.releasesBehind - 1}{' '}
              {translate('auto.components.UpdateCard.ccd8b0a793', 'more since your last update')}
            </UiButton>
          </>
        ) : null}
      </p>
      <ReleaseNotesLink url={props.release.releaseNotesUrl} rich />
      <Button
        variant="default"
        size="sm"
        onClick={props.onUpdate}
        className="w-full cursor-pointer"
      >
        {translate('auto.components.UpdateCard.ec8fe71cfc', 'Update')}
      </Button>
    </div>
  )
}

export function UpdateCardSimpleContent(props: {
  version: string
  releaseUrl: string
  onUpdate: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {translate('auto.components.UpdateCard.9abc59f814', 'Update Available')}
        </h3>
        <DismissButton onClick={props.onClose} />
      </div>
      <p className="text-muted-foreground text-sm">
        {translate('auto.components.UpdateCard.05ad78a6d1', 'Yiru v{{value0}} is ready.', {
          value0: props.version
        })}
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {translate('auto.components.UpdateCard.fdd4a364fa', "Sessions won't be interrupted.")}
      </p>
      <ReleaseNotesLink url={props.releaseUrl} />
      <Button
        variant="default"
        size="sm"
        onClick={props.onUpdate}
        className="mt-0.5 w-full cursor-pointer"
      >
        {translate('auto.components.UpdateCard.ec8fe71cfc', 'Update')}
      </Button>
    </div>
  )
}

export function UpdateCardDownloadingContent(props: {
  version: string
  percent: number
  changelog: ChangelogData | null
  prefersReducedMotion: boolean
  mediaFailed: boolean
  mediaLoaded: boolean
  onMediaError: () => void
  onMediaLoad: () => void
  onCollapse: () => void
}): JSX.Element {
  const release = props.changelog?.release
  const showMedia =
    release?.mediaUrl &&
    !props.mediaFailed &&
    !(props.prefersReducedMotion && isAnimatedUpdateMedia(release.mediaUrl))
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {release
            ? `${translate('auto.components.UpdateCard.f58b5c57a6', 'New:')} ${release.title}`
            : translate('auto.components.UpdateCard.558842597d', 'Downloading Update')}
        </h3>
        <MinimizeButton onClick={props.onCollapse} />
      </div>
      {showMedia && release?.mediaUrl ? (
        <div className="relative overflow-hidden">
          {!props.mediaLoaded ? (
            <div className="bg-muted/50 w-full animate-pulse" style={{ aspectRatio: '16/9' }} />
          ) : null}
          <img
            src={release.mediaUrl}
            alt=""
            className={cn('w-full', props.mediaLoaded ? '' : 'absolute inset-0')}
            style={!props.mediaLoaded ? { visibility: 'hidden' } : undefined}
            onError={props.onMediaError}
            onLoad={props.onMediaLoad}
          />
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {release
          ? release.description
          : translate('auto.components.UpdateCard.93794ea932', 'Yiru v{{value0}} is downloading.', {
              value0: props.version
            })}
      </p>
      <ReleaseNotesLink
        url={release ? release.releaseNotesUrl : updateReleaseUrl(props.version)}
        rich={Boolean(release)}
      />
      <div className="mt-1 flex flex-col gap-2">
        <Progress value={props.percent} className="h-1.5" />
        <p className="text-muted-foreground text-xs">
          {translate('auto.components.UpdateCard.6e45bfa2e0', 'Downloading...')} {props.percent}%
        </p>
      </div>
    </div>
  )
}

export function UpdateCardReadyContent(props: {
  version: string
  onRestart: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {translate('auto.components.UpdateCard.17412483da', 'Ready to Install')}
        </h3>
        <MinimizeButton onClick={props.onClose} />
      </div>
      <p className="text-muted-foreground text-sm">
        {translate(
          'auto.components.UpdateCard.6714206e5a',
          "Yiru v{{value0}} is downloaded. Restart when you're ready.",
          { value0: props.version }
        )}
      </p>
      <Button variant="default" size="sm" onClick={props.onRestart} className="w-full">
        {translate('auto.components.UpdateCard.68b235d264', 'Restart to Update')}
      </Button>
    </div>
  )
}

function ReleaseNotesLink(props: { url: string; rich?: boolean }): JSX.Element {
  return (
    <UiButton
      variant="ghost"
      size="xs"
      className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto self-start border-0 p-0 underline"
      onClick={(event) => openHttpLink(props.url, { event })}
    >
      {props.rich
        ? translate('auto.components.UpdateCard.aad383aecc', 'Read the full release notes')
        : translate('auto.components.UpdateCard.44324ef542', 'Release notes')}
    </UiButton>
  )
}

function DismissButton(props: { onClick: () => void }): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="-m-2 size-7 min-h-[44px] min-w-[44px] shrink-0"
      onClick={props.onClick}
      aria-label={translate('auto.components.UpdateCard.318d3b4bc7', 'Dismiss update')}
    >
      <X className="size-3.5" />
    </Button>
  )
}

function MinimizeButton(props: { onClick: () => void }): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="-m-2 size-7 min-h-[44px] min-w-[44px] shrink-0"
      onClick={props.onClick}
      aria-label={translate('auto.components.UpdateCard.8acbdd3961', 'Minimize to status bar')}
    >
      <Minus className="size-3.5" />
    </Button>
  )
}
