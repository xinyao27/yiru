import { Minus, Plus, Trash, ArrowCounterClockwise as Undo2 } from '@phosphor-icons/react'
import React from 'react'

import { translate } from '../../../i18n/i18n'
import { AccordionContent, AccordionItem } from '../../ui/accordion'
import { Button } from '../../ui/button'
import {
  getDiscardAllPaths,
  getUnstageAllPaths,
  isStageableStatusEntry
} from '../discard-all-sequence'
import { ActionButton } from './action-button'
import type { SourceControlController } from './controller'
import { CONFLICTS_SECTION_LABEL, SECTION_LABELS } from './panel-constants'
import { SourceControlAccordionSectionHeader as SectionHeader } from './section-header'
import { getSourceControlSectionViewAction } from './section-order'
import { SourceControlUncommittedFileList } from './uncommitted-file-list'

type SourceControlUncommittedSectionsProps = {
  controller: SourceControlController
}

function SourceControlUncommittedSections({
  controller
}: SourceControlUncommittedSectionsProps): React.JSX.Element {
  const {
    activeWorktreeId,
    displaySections,
    handleStageAllPaths,
    handleUnstagePaths,
    isExecutingBulk,
    normalizedFilter,
    openAllDiffs,
    openConflictReview,
    requestDiscardAllInArea,
    unfilteredDisplaySectionsById,
    workspacePanelTabId,
    worktreePath
  } = controller

  return (
    <>
      {displaySections.map((section) => {
        const { area, id, items } = section
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
          <AccordionItem key={id} value={id} bordered={false}>
            <SectionHeader
              label={translate(sectionLabel.key, sectionLabel.fallback)}
              count={items.length}
              conflictCount={items.filter((entry) => entry.conflictStatus === 'unresolved').length}
              actions={
                <>
                  {/* Why: no-hover and SSH users need persistent keyboard-reachable actions. */}
                  <div className="can-hover:opacity-0 flex items-center transition-opacity group-focus-within/section:opacity-100 group-hover/section:opacity-100 focus-within:opacity-100">
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
                            'live-summary',
                            { workspacePanelTabId }
                          )
                        } else {
                          openAllDiffs(
                            activeWorktreeId,
                            worktreePath,
                            undefined,
                            sectionViewAction.area,
                            sectionViewAction.entries,
                            { workspacePanelTabId }
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
            <AccordionContent padding="none">
              <SourceControlUncommittedFileList controller={controller} sectionId={id} />
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </>
  )
}

// Why: unlike the branch and history sections, this component forwards the
// entire `controller` object to SourceControlUncommittedFileList for every
// expanded section — that child reads roughly two dozen other controller
// fields (open files, staged diffs, submodule state, ...) this component
// never touches directly. A comparator scoped to the fields read here would
// miss changes that child needs and let it render with stale data, so this
// intentionally stays a plain reference compare on `controller` — safe, but
// only pays off once the 21-hook chain itself stops rebuilding that object
// every render.
export const SourceControlUncommittedSectionsMemo = React.memo(SourceControlUncommittedSections)
