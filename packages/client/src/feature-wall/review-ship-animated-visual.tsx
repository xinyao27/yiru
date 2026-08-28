import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitMerge, Sparkle as Sparkles } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import {
  ArrowUpIcon,
  CheckTinyIcon,
  ChevDownIcon,
  COMMIT_MSG,
  FileIcon,
  PR_BODY,
  PR_TITLE,
  ReviewAnimatedVisualButton,
  SHIP_FILES
} from './review-animated-visual-shared'
import { ReviewShipVisualStyles } from './review-animated-visual-ship-styles'

type ShipPhase = 'idle' | 'commit-reading' | 'commit-ready' | 'pr-reading' | 'pr-ready'
type ShipStoryboard = {
  phase: ShipPhase
  commitMessage: string
  prTitle: string
  prBody: string
  readingFileIndex: number
}

const EMPTY_SHIP_STORYBOARD: ShipStoryboard = {
  phase: 'idle',
  commitMessage: '',
  prTitle: '',
  prBody: '',
  readingFileIndex: -1
}
const COMPLETE_SHIP_STORYBOARD: ShipStoryboard = {
  phase: 'pr-ready',
  commitMessage: COMMIT_MSG,
  prTitle: PR_TITLE,
  prBody: PR_BODY,
  readingFileIndex: -1
}

function useAnimatedShipStoryboard(): ShipStoryboard {
  const [storyboard, setStoryboard] = useState(EMPTY_SHIP_STORYBOARD)

  useEffect(() => {
    let cancelled = false
    const timers = new Set<number>()
    const wait = (durationMs: number): Promise<void> =>
      new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer)
          resolve()
        }, durationMs)
        timers.add(timer)
      })
    const update = (patch: Partial<ShipStoryboard>): void => {
      if (!cancelled) {
        setStoryboard((current) => ({ ...current, ...patch }))
      }
    }
    const type = async (
      field: 'commitMessage' | 'prTitle' | 'prBody',
      text: string
    ): Promise<void> => {
      for (let index = 1; index <= text.length && !cancelled; index += 1) {
        update({ [field]: text.slice(0, index) })
        await wait(field === 'prBody' ? 10 : 16)
      }
    }
    const play = async (): Promise<void> => {
      while (!cancelled) {
        setStoryboard(EMPTY_SHIP_STORYBOARD)
        await wait(520)
        update({ phase: 'commit-reading' })
        for (let index = 0; index < SHIP_FILES.length && !cancelled; index += 1) {
          update({ readingFileIndex: index })
          await wait(220)
        }
        await type('commitMessage', COMMIT_MSG)
        update({ phase: 'commit-ready', readingFileIndex: -1 })
        await wait(700)
        update({ phase: 'pr-reading' })
        await wait(420)
        await type('prTitle', PR_TITLE)
        await type('prBody', PR_BODY)
        update({ phase: 'pr-ready' })
        await wait(2700)
      }
    }
    void play()
    return () => {
      cancelled = true
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  return storyboard
}

function ReviewShipFrame({ storyboard }: { storyboard: ShipStoryboard }): JSX.Element {
  const commitScanning = storyboard.phase === 'commit-reading'
  const commitReady = storyboard.phase === 'commit-ready'
  const prScanning = storyboard.phase === 'pr-reading'
  const prReady = storyboard.phase === 'pr-ready'

  return (
    <div className="ravs-ship-root" data-page="ship">
      <div className="ravs-ship-stack">
        <div className="ravs-sc-card">
          <div className="ravs-sc-header">
            <span className="ravs-sc-ahead">
              <ArrowUpIcon />{' '}
              {translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.cd8a3a39d7',
                '3 commits ahead'
              )}
            </span>
          </div>
          <div className="ravs-sc-commit-area">
            <div className="ravs-sc-textarea">
              <ReviewAnimatedVisualButton
                className={cn('ravs-sc-sparkle', commitScanning && 'is-scanning')}
                aria-label={translate(
                  'auto.components.feature.wall.ReviewShipAnimatedVisual.d1a7f15876',
                  'Generate commit message with AI'
                )}
              >
                <Sparkles className="size-3.5" />
              </ReviewAnimatedVisualButton>
              {storyboard.commitMessage ? null : (
                <span className="ravs-placeholder">
                  {translate(
                    'auto.components.feature.wall.ReviewShipAnimatedVisual.7347fa5839',
                    'Message'
                  )}
                </span>
              )}
              <span>{storyboard.commitMessage}</span>
              {commitScanning ? <span className="ravs-caret" /> : null}
            </div>
            <div className={cn('ravs-sc-split', commitReady && 'is-ready')}>
              <span className="ravs-primary">
                <CheckTinyIcon />{' '}
                {translate(
                  'auto.components.feature.wall.ReviewShipAnimatedVisual.a079083a6c',
                  'Commit'
                )}
              </span>
              <span className="ravs-chev">
                <ChevDownIcon />
              </span>
            </div>
          </div>
          <div className="ravs-sc-changes-header">
            <span>
              {translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.e725000cd7',
                'Changes'
              )}
              <span className="ravs-sc-changes-count">{SHIP_FILES.length}</span>
            </span>
            <span className="ravs-sc-view-all">
              {translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.ea0100dd15',
                'View all'
              )}
            </span>
          </div>
          <div className="ravs-sc-files">
            {SHIP_FILES.map((name, index) => (
              <div
                className={cn(
                  'ravs-sc-file',
                  storyboard.readingFileIndex === index && 'is-reading'
                )}
                key={name}
              >
                <span className="ravs-sc-ficon">
                  <FileIcon />
                </span>
                <span className="ravs-sc-fname">{name}</span>
                <span className="ravs-sc-fmark">M</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ravs-pr-dialog">
          <div className="ravs-pr-head">
            <div className="ravs-pr-title-text">
              {translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.c30cd930ff',
                'Create Pull Request'
              )}
            </div>
            <ReviewAnimatedVisualButton
              className={cn('ravs-pr-gen-btn', prScanning && 'is-scanning')}
              aria-label={translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.e4473d438f',
                'Generate with AI'
              )}
              title={translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.e4473d438f',
                'Generate with AI'
              )}
            >
              <Sparkles className="size-3.5" />
            </ReviewAnimatedVisualButton>
          </div>
          <div className="ravs-pr-body">
            <div className="ravs-pr-field">
              <div className="ravs-pr-field-label">
                {translate(
                  'auto.components.feature.wall.ReviewShipAnimatedVisual.ce7d5d3a18',
                  'Base branch'
                )}
              </div>
              <span className="ravs-pr-base">
                <GitMerge className="size-3" />{' '}
                {translate(
                  'auto.components.feature.wall.ReviewShipAnimatedVisual.3b9b96d6a6',
                  'main'
                )}
              </span>
            </div>
            <PrField
              label={translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.54a093c52d',
                'Title'
              )}
              placeholder={translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.07da9245cc',
                'Pull request title'
              )}
              value={storyboard.prTitle}
            />
            <PrField
              label={translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.3774b80eae',
                'Description'
              )}
              placeholder={translate(
                'auto.components.feature.wall.ReviewShipAnimatedVisual.bcd5cae3c4',
                'Pull request description'
              )}
              value={storyboard.prBody}
              body
            />
            <div className="ravs-pr-footer">
              <ReviewAnimatedVisualButton className="ravs-pr-btn is-outline">
                {translate(
                  'auto.components.feature.wall.ReviewShipAnimatedVisual.62544e0852',
                  'Cancel'
                )}
              </ReviewAnimatedVisualButton>
              <ReviewAnimatedVisualButton
                className={cn('ravs-pr-btn is-solid', prReady && 'is-ready')}
                focusBorder
              >
                {translate(
                  'auto.components.feature.wall.ReviewShipAnimatedVisual.4d99496b8c',
                  'Create PR'
                )}
              </ReviewAnimatedVisualButton>
            </div>
          </div>
        </div>
      </div>
      <ReviewShipVisualStyles />
    </div>
  )
}

function PrField({
  label,
  placeholder,
  value,
  body = false
}: {
  label: string
  placeholder: string
  value: string
  body?: boolean
}): JSX.Element {
  return (
    <div className="ravs-pr-field">
      <div className="ravs-pr-field-label">{label}</div>
      <div className={cn('ravs-pr-input', body && 'is-body')}>
        {value ? <span>{value}</span> : <span className="ravs-placeholder">{placeholder}</span>}
      </div>
    </div>
  )
}

function AnimatedReviewShip(): JSX.Element {
  return <ReviewShipFrame storyboard={useAnimatedShipStoryboard()} />
}

export function ReviewShipAnimatedVisual({
  reducedMotion
}: {
  reducedMotion: boolean
}): JSX.Element {
  return reducedMotion ? (
    <ReviewShipFrame storyboard={COMPLETE_SHIP_STORYBOARD} />
  ) : (
    <AnimatedReviewShip />
  )
}
