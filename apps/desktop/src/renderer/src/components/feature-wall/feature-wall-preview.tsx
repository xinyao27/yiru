import { useState } from 'react'
import type { JSX } from 'react'

import { CaretRight as ChevronRight } from '@/components/regular-icons'
import { translate } from '@/i18n/i18n'
import { track } from '@/lib/telemetry'

import {
  getFeatureWallMediaTile,
  type FeatureWallWorkflow
} from '../../../../shared/feature-wall-workflows'
import type { FeatureWallOpenSourceTelemetry } from '../../../../shared/telemetry-events'

export function PreviewMedia(props: {
  posterUrl: string | null
  gifUrl: string | null
  showGif: boolean
  workflowTitle: string
}): JSX.Element {
  const { posterUrl, gifUrl, showGif, workflowTitle } = props
  const [posterFailed, setPosterFailed] = useState(false)
  const [gifFailed, setGifFailed] = useState(false)
  const renderPoster = posterUrl !== null && !posterFailed
  const renderGif = showGif && gifUrl !== null && !gifFailed

  return (
    <figure
      className="border-border bg-muted relative aspect-[16/10] w-full overflow-hidden rounded-md border"
      aria-hidden
    >
      {renderPoster ? (
        <img
          src={posterUrl ?? undefined}
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
          onError={() => setPosterFailed(true)}
        />
      ) : null}
      {renderGif ? (
        <img
          src={gifUrl ?? undefined}
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
          onError={() => setGifFailed(true)}
        />
      ) : null}
      {!renderPoster && !renderGif ? (
        <div className="absolute inset-0 flex items-end p-4">
          <span className="text-foreground text-sm font-semibold">{workflowTitle}</span>
        </div>
      ) : null}
    </figure>
  )
}

export function RelatedFeatures(props: {
  workflow: FeatureWallWorkflow
  source: FeatureWallOpenSourceTelemetry
}): JSX.Element | null {
  const { workflow, source } = props
  const items = workflow.relatedTileIds
    .map((id) => getFeatureWallMediaTile(id))
    .filter((tile): tile is NonNullable<typeof tile> => tile !== null)
  if (items.length === 0) {
    return null
  }
  return (
    <div className="border-border border-t pt-3.5">
      <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.05em] uppercase">
        {translate(
          'auto.components.feature.wall.FeatureWallPreview.a666384798',
          'Also in this workflow'
        )}
      </h4>
      <ul className="flex flex-col gap-1" role="list">
        {items.map((tile) => (
          <li key={tile.id}>
            <button
              type="button"
              onClick={() => {
                track('feature_wall_docs_clicked', {
                  group_id: workflow.id,
                  tile_id: tile.id,
                  source
                })
                track('feature_wall_tile_clicked', { tile_id: tile.id })
                void window.api.shell.openUrl(tile.docsUrl)
              }}
              className="focus-visible:bg-accent inline-flex items-center gap-1.5 text-left text-[13px] outline-none hover:underline hover:underline-offset-2"
            >
              {tile.title}
              <ChevronRight className="text-muted-foreground size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
