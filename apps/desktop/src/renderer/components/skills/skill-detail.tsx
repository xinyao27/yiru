import { FolderOpen, ArrowClockwise as RefreshCw, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '~renderer/components/ui/badge'
import { Button } from '~renderer/components/ui/button'
import { ScrollArea } from '~renderer/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import {
  skillDirectoryName,
  skillPlacements,
  type DiscoveredSkill,
  type SkillDirectoryEntry,
  type SkillDirectoryListing
} from '~shared/skills'

import { SkillFileTree } from './file-tree'
import { SKILL_FILE_NAME } from './file-tree-model'
import { formatUpdatedAt, providerLabels, sourceLabels } from './labels'
import { SkillPlacementTable } from './placement-table'
import { SkillFileView } from './skill-file-view'
import { startSkillUpdateRun } from './skill-update-run-store'

export type SkillDetailProps = {
  skill: DiscoveredSkill
  /** The freshness scan cleared this skill for the validated update rail. */
  updatable: boolean
  /** A manage run already owns the CLI; a second one would be refused anyway. */
  busy: boolean
  onRemove: (skill: DiscoveredSkill) => void
}

const EMPTY_FILES: SkillDirectoryEntry[] = []

function SkillDetailActions({
  skill,
  updatable,
  busy,
  onRemove
}: SkillDetailProps): React.JSX.Element {
  const revealSkill = async (): Promise<void> => {
    const result = await window.api.shell.openInFileManager(skill.skillFilePath)
    if (!result.ok) {
      toast.error(
        translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
      )
    }
  }

  // Why: `skills remove` only reaches the global skill home. Bundled, plugin,
  // and repo-scoped copies are owned by something else and must stay read-only.
  const removable = skill.installed && skill.sourceKind === 'home'

  return (
    <div className="flex shrink-0 items-center gap-1">
      {updatable ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => void startSkillUpdateRun([skillDirectoryName(skill)])}
                aria-label={translate('auto.components.skills.SkillDetail.update', 'Update skill')}
              >
                <RefreshCw className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.skills.SkillDetail.update', 'Update skill')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {removable ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => onRemove(skill)}
                aria-label={translate('auto.components.skills.SkillDetail.remove', 'Remove skill')}
              >
                <Trash className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.skills.SkillDetail.remove', 'Remove skill')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void revealSkill()}
              aria-label={translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
            >
              <FolderOpen className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function SkillDetail(props: SkillDetailProps): React.JSX.Element {
  const { skill } = props
  const [listing, setListing] = useState<SkillDirectoryListing | null>(null)
  const [selectedRelativePath, setSelectedRelativePath] = useState(SKILL_FILE_NAME)
  const directoryPath = skill.directoryPath
  const placements = skillPlacements(skill)

  useEffect(() => {
    let cancelled = false
    setListing(null)
    window.api.skills
      .listSkillFiles(directoryPath)
      .then((result) => {
        if (!cancelled) {
          setListing(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListing({ ok: false, reason: 'unreadable' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [directoryPath])

  const files = listing?.ok ? listing.files : EMPTY_FILES

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-border shrink-0 space-y-2 border-b px-5 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-sm font-semibold">{skill.name}</h2>
              <Badge
                variant={skill.installed ? 'secondary' : 'outline'}
                className="h-5 text-[10px]"
              >
                {skill.installed
                  ? translate('auto.components.skills.SkillsPage.0c74e7ff34', 'Local')
                  : translate('auto.components.skills.SkillsPage.35b9a724a0', 'Available')}
              </Badge>
              <Badge variant="outline" className="h-5 text-[10px]">
                {sourceLabels[skill.sourceKind]}
              </Badge>
              {skill.providers.map((provider) => (
                <Badge key={provider} variant="outline" className="h-5 text-[10px]">
                  {providerLabels[provider]}
                </Badge>
              ))}
            </div>
            <p
              className="text-muted-foreground truncate font-mono text-[11px]"
              title={skill.skillFilePath}
            >
              {skill.skillFilePath}
            </p>
          </div>
          <SkillDetailActions {...props} />
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px]">
          <span>{skill.sourceLabel}</span>
          <span>{formatUpdatedAt(skill.updatedAt)}</span>
        </div>
      </div>

      <div className="border-border shrink-0 border-b py-1">
        <SkillPlacementTable placements={placements} />
      </div>

      {listing && !listing.ok ? (
        <p className="text-muted-foreground border-border shrink-0 border-b px-5 py-2 text-xs">
          {translate(
            'auto.components.skills.SkillDetail.listingFailed',
            'Could not list the files in this skill.'
          )}
        </p>
      ) : null}
      {files.length > 0 ? (
        <div className="border-border shrink-0 border-b">
          <SkillFileTree
            files={files}
            selectedRelativePath={selectedRelativePath}
            onSelect={setSelectedRelativePath}
          />
          {listing?.ok === true && listing.truncated ? (
            <p className="text-muted-foreground px-3 pb-2 text-[11px]">
              {translate(
                'auto.components.skills.SkillDetail.listingTruncated',
                'Only the first files in this skill are listed.'
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-4">
          <SkillFileView directoryPath={directoryPath} relativePath={selectedRelativePath} />
        </div>
      </ScrollArea>
    </div>
  )
}
