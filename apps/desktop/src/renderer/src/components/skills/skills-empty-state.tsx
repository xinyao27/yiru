import { ArrowClockwise, BookOpen } from '@phosphor-icons/react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function SkillsEmptyState({
  loading,
  hasSkills,
  onRefresh
}: {
  loading: boolean
  hasSkills: boolean
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {loading ? (
          <LoadingIndicator className="text-muted-foreground size-7" />
        ) : (
          <BookOpen className="text-muted-foreground size-7" />
        )}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {loading
              ? translate('auto.components.skills.SkillsPage.cd7893fbc1', 'Scanning skills')
              : hasSkills
                ? translate('auto.components.skills.SkillsPage.6a62a0168c', 'No matches')
                : translate(
                    'auto.components.skills.SkillsPage.4acd6d68ec',
                    'No local skills found'
                  )}
          </h3>
          <p className="text-muted-foreground text-xs leading-5">
            {hasSkills
              ? translate(
                  'auto.components.skills.SkillsPage.08a321a984',
                  'Adjust the search or filters.'
                )
              : translate(
                  'auto.components.skills.SkillsPage.ab5b777350',
                  'Checked local home, repository, bundled, and plugin skill folders.'
                )}
          </p>
        </div>
        {!loading ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <ArrowClockwise className="size-4" />
            {translate('auto.components.skills.SkillsPage.cb142070b4', 'Refresh')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
