import { CaretUpDown as ChevronsUpDown, Check, HardDrives as Server } from '@phosphor-icons/react'
import React from 'react'
import type { ReadyProjectHostSetupOption } from '~renderer/components/new-workspace-composer-card/project-host-setup-options'
import { Button } from '~renderer/components/ui/button'
import { Command, CommandEmpty, CommandItem, CommandList } from '~renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/components/ui/popover'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

type WorkspaceRunTargetComboboxProps = {
  hostOptions: readonly ReadyProjectHostSetupOption[]
  hostValue: string | null
  onHostChange?: (setupId: string) => void
}

export function WorkspaceRunTargetCombobox({
  hostOptions,
  hostValue,
  onHostChange
}: WorkspaceRunTargetComboboxProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const selectedHost =
    hostOptions.find((option) => option.id === hostValue) ?? hostOptions[0] ?? null
  const selectedValue = selectedHost ? `host:${selectedHost.id}` : ''

  const handleHostSelect = React.useCallback(
    (setupId: string): void => {
      if (!hostOptions.some((candidate) => candidate.id === setupId)) {
        return
      }
      onHostChange?.(setupId)
      setOpen(false)
    },
    [hostOptions, onHostChange]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="border-input focus:border-ring h-9 w-full justify-between px-3 text-sm font-normal"
          >
            {selectedHost ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Server className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate">{selectedHost.label}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {translate(
                  'auto.components.NewWorkspaceComposerCard.chooseRunTarget',
                  'Choose target'
                )}
              </span>
            )}
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
      >
        <Command value={selectedValue}>
          <CommandList>
            <CommandEmpty>
              {translate(
                'auto.components.NewWorkspaceComposerCard.noRunTargets',
                'No run targets are ready for this project.'
              )}
            </CommandEmpty>
            {hostOptions.map((option) => (
              <CommandItem
                key={option.id}
                value={`host:${option.id}`}
                onSelect={() => handleHostSelect(option.id)}
                className="items-center gap-2 px-3 py-2"
              >
                <Check
                  className={cn(
                    'size-4 text-foreground',
                    option.id === selectedHost?.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Server className="text-muted-foreground size-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{option.label}</div>
                  <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
                    {option.path}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
