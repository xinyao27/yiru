import { DownloadSimple as Import } from '@phosphor-icons/react'
import { LoadingIndicator } from '@/components/loading-indicator'
import {
  YIRU_CLI_SKILL_INSTALL_COMMAND,
  YIRU_CLI_SKILL_UPDATE_COMMAND
} from '@/lib/agent-feature-install-commands'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureYiruCliAvailableForAgentSkillTerminal
} from '@/lib/agent-skill-cli-prerequisite'
import { cn } from '@/lib/class-names'
import { useMobileEmulatorAgentSetupState } from '../emulator-pane/use-mobile-emulator-agent-setup-state'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'
import { buildSkillCommandForRuntime } from './CliSkillRuntimeSetup'
import { StepBadge } from './BrowserUseStepBadge'
import { MobileEmulatorExamples } from './MobileEmulatorExamples'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { translate } from '@/i18n/i18n'

const EMULATOR_CLI_COMMANDS = [
  'yiru emulator list --json',
  'yiru emulator attach "iPhone 16 Pro" --json',
  'yiru emulator tap 0.5 0.7 --json',
  'yiru emulator type "hello" --json'
] as const

export function MobileEmulatorAgentControlRow(): React.JSX.Element {
  const setup = useMobileEmulatorAgentSetupState(true)
  const cliSkillInstallCommand = buildSkillCommandForRuntime(YIRU_CLI_SKILL_INSTALL_COMMAND)
  const cliSkillUpdateCommand = buildSkillCommandForRuntime(YIRU_CLI_SKILL_UPDATE_COMMAND)

  const handleEnableCli = async (): Promise<void> => {
    await setup.handleEnableCli()
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">
            {translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.2a674aa810',
              'Agent Mobile Emulator Control'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.ff4b7e65d6',
              'Let coding agents control the active mobile emulator with Yiru CLI commands.'
            )}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            setup.completedCount === 2
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {setup.completedCount}/2
        </span>
      </div>

      <div className="mt-3 divide-y divide-border/40">
        <div className="flex items-start gap-3 py-3">
          <StepBadge
            index={1}
            state={setup.cliEnabled ? 'done' : setup.cliBusy ? 'in-progress' : 'pending'}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.4f2205f3b6',
                'Enable Yiru CLI'
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.2fef055608',
                'Registers the Yiru CLI command so agents can control the active emulator from their shell.'
              )}
            </p>
            {setup.cliInstallStatus?.commandPath && setup.cliEnabled ? (
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.settings.MobileEmulatorAgentControlRow.aaf62a3dd2',
                  'Installed at'
                )}{' '}
                <code className="rounded bg-muted px-1 py-0.5">
                  {setup.cliInstallStatus.commandPath}
                </code>
              </p>
            ) : null}
            {!setup.cliEnabled && setup.cliInstallStatus?.detail ? (
              <p className="text-[11px] text-muted-foreground">{setup.cliInstallStatus.detail}</p>
            ) : null}
            {setup.cliBusy ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {translate(
                  'auto.components.settings.MobileEmulatorAgentControlRow.3d34423e88',
                  'Registering the Yiru CLI'
                )}{' '}
                {setup.cliInstallStatus?.commandPath ? (
                  <code className="rounded bg-muted px-1 py-0.5">
                    {setup.cliInstallStatus.commandPath}
                  </code>
                ) : null}{' '}
                {translate(
                  'auto.components.settings.MobileEmulatorAgentControlRow.3be27641c9',
                  'so emulator commands can run from agent shells.'
                )}
              </p>
            ) : null}
          </div>
          <TooltipProvider delay={250}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <Button
                      type="button"
                      size="sm"
                      variant={setup.cliEnabled ? 'outline' : 'default'}
                      disabled={
                        setup.cliLoading || setup.cliBusy || !setup.cliSupported || setup.cliEnabled
                      }
                      onClick={() => void handleEnableCli()}
                    >
                      {setup.cliLoading || setup.cliBusy ? (
                        <LoadingIndicator className="size-3.5" />
                      ) : null}
                      {setup.cliActionLabel}
                    </Button>
                  </span>
                }
              />
              {!setup.cliSupported && !setup.cliLoading && setup.cliInstallStatus?.detail ? (
                <TooltipContent side="left" sideOffset={6}>
                  {setup.cliInstallStatus.detail}
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className={cn('py-3', setup.step2Blocked && 'opacity-60')}>
          <AgentSkillSetupPanel
            variant="inline"
            title={translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.67e19ee03c',
              'Yiru CLI skill'
            )}
            description={translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.d94ca6a623',
              'Enables agents to use Yiru CLI commands, including mobile emulator control.'
            )}
            command={cliSkillInstallCommand}
            installedCommand={cliSkillUpdateCommand}
            terminalTitle="Yiru CLI skill setup"
            terminalAriaLabel="Yiru CLI skill install terminal"
            terminalWorktreeId="settings-mobile-emulator-yiru-cli-skill-terminal"
            installed={setup.cliSkillInstalled}
            loading={setup.cliSkillLoading}
            error={setup.cliSkillError}
            installDisabled={setup.step2Blocked}
            leading={<StepBadge index={2} state={setup.cliSkillInstalled ? 'done' : 'pending'} />}
            preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
            openingHint={translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.3941719a56',
              'Checking Yiru CLI before opening skill setup.'
            )}
            onBeforeOpenTerminal={async () => {
              await ensureYiruCliAvailableForAgentSkillTerminal()
            }}
            onRecheck={setup.refreshCliSkill}
          />
        </div>

        <div className="py-3">
          <div className="flex items-center gap-2">
            <Import className="size-3.5 text-muted-foreground" />
            <p className="text-sm font-medium">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.c7f3fe0a6e',
                'Common emulator commands'
              )}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.8af7a8bc38',
              'Commands target the active emulator for the current worktree. Coordinates are normalized from 0..1.'
            )}
          </p>
          <div className="mt-3 grid gap-1.5 [@media(min-width:520px)]:grid-cols-2">
            {EMULATOR_CLI_COMMANDS.map((command) => (
              <code
                key={command}
                className="block break-all rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-[11px] leading-snug text-foreground"
              >
                {command}
              </code>
            ))}
          </div>
        </div>

        <MobileEmulatorExamples variant="inline" />
      </div>
    </div>
  )
}
