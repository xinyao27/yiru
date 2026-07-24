import { Minus, Plus, Trash, ArrowCounterClockwise as Undo2 } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

import {
  getDiscardAllPaths,
  getUnstageAllPaths,
  isStageableStatusEntry
} from './discard-all-sequence'
import type { SourceControlController } from './source-control-controller'
import { ActionButton } from './source-control-empty-state'
import { CONFLICTS_SECTION_LABEL, SECTION_LABELS } from './source-control-panel-constants'
import { SourceControlSectionHeader as SectionHeader } from './source-control-section-header'
import { getSourceControlSectionViewAction } from './source-control-section-order'
import { SourceControlUncommittedFileList } from './source-control-uncommitted-file-list'

export function SourceControlUncommittedSections({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    activeWorktreeId,
    collapsedSections,
    displaySections,
    handleStageAllPaths,
    handleUnstagePaths,
    isExecutingBulk,
    normalizedFilter,
    openAllDiffs,
    openConflictReview,
    requestDiscardAllInArea,
    toggleSection,
    unfilteredDisplaySectionsById,
    worktreePath
  } = controller

  return (
    <>
      {displaySections.map((section) => {
        const { area, id, items } = section
        const isCollapsed = collapsedSections.has(id)
        // Why: bulk actions operate on the unfiltered group; hiding them under a filter avoids surprises.
        const actionSection = unfilteredDisplaySectionsById.get(id) ?? section
        const actionItems = actionSection.items
        const stageAllPaths = actionItems.filter(isStageableStatusEntry).map((entry) => entry.path)
        const unstageAllPaths = getUnstageAllPaths(actionItems)
        const discardAllPaths = getDiscardAllPaths(actionItems, area)
        const canStageAll = !normalizedFilter && stageAllPaths.length > 0
        const canUnstageAll = !normalizedFilter && unstageAllPaths.length > 0
        const canRevertAll = !normalizedFilter && discardAllPaths.length > 0
        const sectionLabel = id === 'conflicts' ? CONFLICTS_SECTION_LABEL : SECTION_LABELS[area]
        const sectionViewAction = getSourceControlSectionViewAction(actionSection)

        return (
          <div key={id}>
            <SectionHeader
              label={translate(sectionLabel.key, sectionLabel.fallback)}
              count={items.length}
              conflictCount={items.filter((entry) => entry.conflictStatus === 'unresolved').length}
              isCollapsed={isCollapsed}
              onToggle={() => toggleSection(id)}
              actions={
                <>
                  {/* Why: no-hover and SSH users need persistent keyboard-reachable actions. */}
                  <div className="can-hover:opacity-0 flex items-center transition-opacity group-hover/section:opacity-100 focus-within:opacity-100">
                    {canRevertAll ? (
                      <ActionButton
                        icon={area === 'untracked' ? Trash : Undo2}
                        iconWeight={area === 'untracked' ? undefined : 'regular'}
                        title={
                          area === 'untracked'
                            ? translate(
                                'auto.components.right.sidebar.SourceControl.2f609a2e7c',
                                'Delete all untracked'
                              )
                            : translate(
                                'auto.components.right.sidebar.SourceControl.ce41708855',
                                'Discard all'
                              )
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          requestDiscardAllInArea(area, discardAllPaths)
                        }}
                        disabled={isExecutingBulk}
                      />
                    ) : null}
                    {canStageAll ? (
                      <ActionButton
                        icon={Plus}
                        title={translate(
                          'auto.components.right.sidebar.SourceControl.24d2598eff',
                          'Stage all'
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleStageAllPaths(stageAllPaths)
                        }}
                        disabled={isExecutingBulk}
                      />
                    ) : null}
                    {canUnstageAll ? (
                      <ActionButton
                        icon={Minus}
                        title={translate(
                          'auto.components.right.sidebar.SourceControl.9339382454',
                          'Unstage all'
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleUnstagePaths(unstageAllPaths)
                        }}
                        disabled={isExecutingBulk}
                      />
                    ) : null}
                  </div>
                  {sectionViewAction ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className={
                        items.some((entry) => entry.conflictStatus === 'unresolved')
                          ? 'h-6 px-1.5 text-[10px]'
                          : 'h-auto px-1.5 py-0.5 text-xs'
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!activeWorktreeId || !worktreePath) {
                          return
                        }
                        if (sectionViewAction.kind === 'conflict-review') {
                          openConflictReview(
                            activeWorktreeId,
                            worktreePath,
                            sectionViewAction.entries,
                            'live-summary'
                          )
                        } else {
                          openAllDiffs(
                            activeWorktreeId,
                            worktreePath,
                            undefined,
                            sectionViewAction.area,
                            sectionViewAction.entries
                          )
                        }
                      }}
                    >
                      {translate(
                        'auto.components.right.sidebar.SourceControl.48db37cca9',
                        'View all'
                      )}
                    </Button>
                  ) : null}
                </>
              }
            />
            {isCollapsed ? null : (
              <SourceControlUncommittedFileList controller={controller} sectionId={id} />
            )}
          </div>
        )
      })}
    </>
  )
}
