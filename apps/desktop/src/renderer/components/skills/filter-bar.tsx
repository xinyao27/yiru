import { MagnifyingGlass as Search } from '@phosphor-icons/react'
import { Input } from '~renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~renderer/components/ui/select'
import { translate } from '~renderer/i18n/i18n'

import type { SkillsFilterState } from './filter'

export type SkillsFilterBarProps = {
  filters: SkillsFilterState
  onFiltersChange: (next: (current: SkillsFilterState) => SkillsFilterState) => void
}

export function SkillsFilterBar({
  filters,
  onFiltersChange
}: SkillsFilterBarProps): React.JSX.Element {
  return (
    <section className="border-border flex shrink-0 flex-col gap-2 border-b px-3 py-3">
      <div className="relative min-w-0">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          size="sm"
          value={filters.query}
          onChange={(event) => onFiltersChange((next) => ({ ...next, query: event.target.value }))}
          placeholder={translate('auto.components.skills.SkillsPage.a68dee6a32', 'Search skills')}
          className="pl-8"
        />
      </div>
      <div className="flex gap-2">
        <Select
          value={filters.provider}
          onValueChange={(value) =>
            onFiltersChange((next) => ({
              ...next,
              provider: value as SkillsFilterState['provider']
            }))
          }
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('auto.components.skills.SkillsPage.39b6998ddb', 'All providers')}
            </SelectItem>
            <SelectItem value="codex">
              {translate('auto.components.skills.SkillsPage.426be2aac6', 'Codex')}
            </SelectItem>
            <SelectItem value="claude">
              {translate('auto.components.skills.SkillsPage.fb6bf60b52', 'Claude')}
            </SelectItem>
            <SelectItem value="agent-skills">
              {translate('auto.components.skills.SkillsPage.38e0951c3a', 'Agent Skills')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.sourceKind}
          onValueChange={(value) =>
            onFiltersChange((next) => ({
              ...next,
              sourceKind: value as SkillsFilterState['sourceKind']
            }))
          }
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('auto.components.skills.SkillsPage.0bc1379f4c', 'All sources')}
            </SelectItem>
            <SelectItem value="home">
              {translate('auto.components.skills.SkillsPage.571c5818c1', 'Home')}
            </SelectItem>
            <SelectItem value="repo">
              {translate('auto.components.skills.SkillsPage.aa59462502', 'Repository')}
            </SelectItem>
            <SelectItem value="bundled">
              {translate('auto.components.skills.SkillsPage.4d177feabd', 'Bundled')}
            </SelectItem>
            <SelectItem value="plugin">
              {translate('auto.components.skills.SkillsPage.984405683f', 'Plugin')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}
