import { Warning as AlertTriangle, CheckCircle as CheckCircle2 } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/components/ui/dialog'
import { ScrollArea } from '~renderer/components/ui/scroll-area'
import { translate } from '~renderer/i18n/i18n'
import type { SkillUpdateRun } from '~shared/skill-freshness'
import { skillDirectoryName, type DiscoveredSkill } from '~shared/skills'

import { describeSkillRunFailure, SkillRunLog } from './run-log'
import {
  acknowledgeSkillUpdateRun,
  cancelSkillUpdateRun,
  holdSkillRunResult,
  startSkillRemoveRun,
  useSkillRunForOperation
} from './skill-update-run-store'
import { describeSkillRunRejection } from './start-rejection'

export type SkillRemoveDialogProps = {
  skill: DiscoveredSkill
  onOpenChange: (open: boolean) => void
}

const IDLE_RUN: SkillUpdateRun = { state: 'idle' }

export function SkillRemoveDialog({
  skill,
  onOpenChange
}: SkillRemoveDialogProps): React.JSX.Element {
  const [submitted, setSubmitted] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)
  // Why: the CLI matches the install directory, which a frontmatter display
  // name can differ from — `name: React Native` in `react-native/SKILL.md`.
  const folderName = skillDirectoryName(skill)
  const liveRun = useSkillRunForOperation('remove')
  // Why: a stale settled run belongs to whoever started it, but a removal still
  // in flight is exactly what this dialog should be narrating.
  const run = submitted || liveRun.state === 'running' ? liveRun : IDLE_RUN
  useEffect(() => holdSkillRunResult(), [])
  const isRunning = run.state === 'running'
  const isStopping = isRunning && run.stopping === true

  const submit = async (): Promise<void> => {
    setRejection(null)
    // Why: only skills in the global home reach this dialog, so the CLI always
    // runs with `-g`; a repo-scoped copy is owned by that checkout instead.
    const result = await startSkillRemoveRun({ names: [folderName], scope: { kind: 'global' } })
    if (!result?.started) {
      setRejection(describeSkillRunRejection(result?.reason))
      return
    }
    setSubmitted(true)
  }

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      return
    }
    if (run.state === 'success' || run.state === 'error') {
      void acknowledgeSkillUpdateRun()
    }
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.skills.SkillRemoveDialog.title', 'Remove skill')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.skills.SkillRemoveDialog.description',
              'Deletes {{value0}} from the global skill home shared by every project.',
              { value0: skill.name }
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4">
            <div className="text-muted-foreground space-y-1 text-[11px]">
              {folderName === skill.name ? null : (
                <p>
                  {translate(
                    'auto.components.skills.SkillRemoveDialog.folderName',
                    'Removes the skill folder {{value0}}.',
                    { value0: folderName }
                  )}
                </p>
              )}
              <p className="font-mono break-words">{skill.directoryPath}</p>
            </div>

            {rejection ? <p className="text-destructive text-xs">{rejection}</p> : null}

            {isRunning ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <LoadingIndicator className="size-4" />
                {isStopping
                  ? translate(
                      'auto.components.skills.SkillRemoveDialog.stoppingHeadline',
                      'Stopping the removal…'
                    )
                  : translate(
                      'auto.components.skills.SkillRemoveDialog.runningHeadline',
                      'Removing…'
                    )}
              </div>
            ) : null}

            {run.state === 'success' ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2
                  weight="regular"
                  className="size-4 text-emerald-600 dark:text-emerald-400"
                />
                {translate('auto.components.skills.SkillRemoveDialog.success', 'Skill removed')}
              </div>
            ) : null}

            {run.state === 'error' ? (
              <div className="border-destructive text-muted-foreground space-y-2 border p-3 text-xs">
                <p className="text-foreground flex items-center gap-2 font-medium">
                  <AlertTriangle weight="regular" className="text-destructive size-4" />
                  {translate(
                    'auto.components.skills.SkillRemoveDialog.errorTitle',
                    "The removal didn't finish"
                  )}
                </p>
                <p className="font-mono text-[11px] break-words">{describeSkillRunFailure(run)}</p>
              </div>
            ) : null}

            {run.state === 'idle' ? null : <SkillRunLog output={run.output} />}
          </div>
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <div>
            {isRunning ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isStopping}
                onClick={() => void cancelSkillUpdateRun()}
              >
                {isStopping
                  ? translate('auto.components.skills.SkillRemoveDialog.stopping', 'Stopping…')
                  : translate('auto.components.skills.SkillRemoveDialog.stop', 'Stop')}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              {run.state === 'success'
                ? translate('auto.components.skills.SkillRemoveDialog.done', 'Done')
                : translate('auto.components.skills.SkillRemoveDialog.cancel', 'Cancel')}
            </Button>
            {run.state === 'success' ? null : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isRunning}
                onClick={() => void submit()}
              >
                {run.state === 'error'
                  ? translate('auto.components.skills.SkillRemoveDialog.retry', 'Retry removal')
                  : translate('auto.components.skills.SkillRemoveDialog.confirm', 'Remove')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
