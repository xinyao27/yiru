import { ArrowRight, FolderOpen } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '~renderer/components/ui/badge'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import type { SkillPlacement } from '~shared/skills'

import { formatUpdatedAt, providerLabels } from './labels'
import {
  placementTopologyDescription,
  placementTopologyIcons,
  placementTopologyLabel
} from './placement-labels'

export type SkillPlacementTableProps = {
  placements: readonly SkillPlacement[]
}

async function revealPlacement(placement: SkillPlacement): Promise<void> {
  const result = await window.api.shell.openInFileManager(placement.skillFilePath)
  if (!result.ok) {
    toast.error(
      translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
    )
  }
}

function SkillPlacementRow({ placement }: { placement: SkillPlacement }): React.JSX.Element {
  const TopologyIcon = placementTopologyIcons[placement.topology]
  return (
    <li className="border-border/60 flex min-w-0 items-start gap-3 border-t px-5 py-2 first:border-t-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-mono text-[11px]" title={placement.directoryPath}>
          {placement.directoryPath}
        </p>
        <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 text-[11px]">
          <span className="truncate">{placement.rootLabel}</span>
          <span aria-hidden>·</span>
          <span className="truncate">
            {placement.providers.map((provider) => providerLabels[provider]).join(', ')}
          </span>
          <span aria-hidden>·</span>
          <span>{formatUpdatedAt(placement.updatedAt)}</span>
        </p>
        {placement.linkTargetPath ? (
          <p
            className="text-muted-foreground flex min-w-0 items-center gap-1 font-mono text-[11px]"
            title={placement.linkTargetPath}
          >
            <ArrowRight weight="regular" className="size-3 shrink-0" />
            <span className="truncate">{placement.linkTargetPath}</span>
          </p>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="outline" className="h-5 shrink-0 gap-1 text-[10px]">
              <TopologyIcon weight="regular" className="size-3" />
              {placementTopologyLabel(placement.topology)}
            </Badge>
          }
        />
        <TooltipContent side="left" sideOffset={6} className="max-w-64">
          {placementTopologyDescription(placement.topology)}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => void revealPlacement(placement)}
              aria-label={translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
            >
              <FolderOpen weight="regular" className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="left" sideOffset={6}>
          {translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}

/** Every directory holding this skill, and how each one holds it. */
export function SkillPlacementTable({ placements }: SkillPlacementTableProps): React.JSX.Element {
  return (
    <section>
      <h3 className="text-muted-foreground px-5 py-1.5 text-[10px] font-medium tracking-wide uppercase">
        {translate('auto.components.skills.SkillPlacementTable.title', 'Installed in')}
      </h3>
      <ul>
        {placements.map((placement) => (
          <SkillPlacementRow key={placement.id} placement={placement} />
        ))}
      </ul>
    </section>
  )
}
