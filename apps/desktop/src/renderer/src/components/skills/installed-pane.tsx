import { BookOpen } from '@phosphor-icons/react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { translate } from '@/i18n/i18n'

import type { DiscoveredSkill } from '../../../../shared/skills'
import { SkillsEmptyState } from './empty-state'
import type { SkillsFilterState } from './filter'
import { SkillsFilterBar } from './filter-bar'
import { sourceLabels } from './labels'
import { SkillDetail } from './skill-detail'

export type SkillsInstalledPaneProps = {
  /** Everything discovery found, used to tell "no skills" from "no matches". */
  skills: readonly DiscoveredSkill[]
  visibleSkills: readonly DiscoveredSkill[]
  filters: SkillsFilterState
  onFiltersChange: (next: (current: SkillsFilterState) => SkillsFilterState) => void
  loading: boolean
  onRefresh: () => void
  busy: boolean
  onRemove: (skill: DiscoveredSkill) => void
  /** The freshness scan cleared this skill for the validated update rail. */
  isUpdatable: (skill: DiscoveredSkill) => boolean
}

function SkillRow({
  skill,
  selected,
  onSelect
}: {
  skill: DiscoveredSkill
  selected: boolean
  onSelect: (skill: DiscoveredSkill) => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="picker-row"
      size="picker-row"
      role="option"
      aria-selected={selected}
      className="w-full items-start"
      onClick={() => onSelect(skill)}
    >
      <BookOpen weight="regular" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{skill.name}</span>
          <Badge variant="outline" className="h-4 shrink-0 text-[10px]">
            {sourceLabels[skill.sourceKind]}
          </Badge>
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {skill.description ??
            translate('auto.components.skills.SkillsPage.9963dff6d3', 'No description found.')}
        </span>
      </span>
    </Button>
  )
}

export function SkillsInstalledPane({
  skills,
  visibleSkills,
  filters,
  onFiltersChange,
  loading,
  onRefresh,
  busy,
  onRemove,
  isUpdatable
}: SkillsInstalledPaneProps): React.JSX.Element {
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  // Why: resolving the selection during render keeps one rule for both "nothing
  // picked yet" and "the pick was filtered out" — fall back to the first row —
  // without an effect that writes state back on every list change.
  const selectedSkill =
    visibleSkills.find((skill) => skill.id === selectedSkillId) ?? visibleSkills[0] ?? null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="border-border flex w-[340px] shrink-0 flex-col border-r">
        <SkillsFilterBar filters={filters} onFiltersChange={onFiltersChange} />
        <ScrollArea className="min-h-0 flex-1">
          <div role="listbox" className="p-1.5">
            {visibleSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                selected={skill.id === selectedSkill?.id}
                onSelect={(next) => setSelectedSkillId(next.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {selectedSkill ? (
        <SkillDetail
          // Why: the detail pane holds the picked file in local state, so a new
          // skill must remount rather than keep pointing at the old one.
          key={selectedSkill.id}
          skill={selectedSkill}
          updatable={isUpdatable(selectedSkill)}
          busy={busy}
          onRemove={onRemove}
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SkillsEmptyState loading={loading} hasSkills={skills.length > 0} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  )
}
