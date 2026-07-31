import {
  Cloud,
  CaretRight as ChevronRight,
  CaretUpDown as ChevronsUpDown,
  Check,
  HardDrives as Server
} from '@phosphor-icons/react'
import React from 'react'

import type { ReadyProjectHostSetupOption } from '@/components/new-workspace-composer-card/project-host-setup-options'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { EphemeralVmRecipeOption } from './card-types'

function getRecipeCommandDisplay(command: string): string {
  const trimmed = command.trim()
  const quoted = trimmed.match(/^"([^"]+)"/) ?? trimmed.match(/^'([^']+)'/)
  return quoted?.[1] ?? trimmed.split(/\s+/)[0] ?? trimmed
}

function getRecipeDestroyLabel(recipe: EphemeralVmRecipeOption): string {
  if (recipe.destroyDisabled) {
    return translate('auto.components.NewWorkspaceComposerCard.destroyDisabled', 'destroy disabled')
  }
  if (recipe.destroy) {
    return translate(
      'auto.components.NewWorkspaceComposerCard.destroyConfigured',
      'destroy configured'
    )
  }
  return translate('auto.components.NewWorkspaceComposerCard.noDestroyConfigured', 'no destroy')
}

type WorkspaceRunTargetComboboxProps = {
  hostOptions: readonly ReadyProjectHostSetupOption[]
  hostValue: string | null
  onHostChange?: (setupId: string) => void
  recipes: EphemeralVmRecipeOption[]
  recipeValue: string | null
  onRecipeChange?: (recipeId: string | null) => void
}

export function WorkspaceRunTargetCombobox({
  hostOptions,
  hostValue,
  onHostChange,
  recipes,
  recipeValue,
  onRecipeChange
}: WorkspaceRunTargetComboboxProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const [vmRecipesOpen, setVmRecipesOpen] = React.useState(false)
  const selectedHost =
    hostOptions.find((option) => option.id === hostValue) ?? hostOptions[0] ?? null
  const selectedRecipe = recipes.find((recipe) => recipe.id === recipeValue) ?? null
  const selectedValue = selectedRecipe
    ? `recipe:${selectedRecipe.id}`
    : selectedHost
      ? `host:${selectedHost.id}`
      : ''
  const ephemeralVmLabel = translate(
    'auto.components.NewWorkspaceComposerCard.ephemeralVm',
    'Per-Workspace Environment'
  )

  const handleHostSelect = React.useCallback(
    (setupId: string): void => {
      if (!hostOptions.some((candidate) => candidate.id === setupId)) {
        return
      }
      onHostChange?.(setupId)
      onRecipeChange?.(null)
      setOpen(false)
    },
    [hostOptions, onHostChange, onRecipeChange]
  )

  const handleRecipeSelect = React.useCallback(
    (recipeId: string): void => {
      if (!recipes.some((recipe) => recipe.id === recipeId)) {
        return
      }
      onRecipeChange?.(recipeId)
      setVmRecipesOpen(false)
      setOpen(false)
    },
    [onRecipeChange, recipes]
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
            {selectedRecipe ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Cloud className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate">
                  {ephemeralVmLabel} / {selectedRecipe.name}
                </span>
              </span>
            ) : selectedHost ? (
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
                    !selectedRecipe && option.id === selectedHost?.id ? 'opacity-100' : 'opacity-0'
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
            {recipes.length > 0 ? (
              <Popover open={vmRecipesOpen} onOpenChange={setVmRecipesOpen}>
                {/* Why: a real CommandItem (not a raw button) so cmdk registers it — fixes the row
                    only rendering under the first host, the uneven height, and the double-highlight. */}
                <PopoverTrigger
                  render={
                    <CommandItem
                      value="per-workspace-env"
                      onSelect={() => setVmRecipesOpen(true)}
                      className="items-center gap-2 px-3 py-2"
                    >
                      <Check
                        className={cn(
                          'size-4 text-foreground',
                          selectedRecipe ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <Cloud className="text-muted-foreground size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{ephemeralVmLabel}</div>
                        {/* Why: a second line so this row matches the two-line height of the host
                            options above, and to hint what choosing it opens. */}
                        <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
                          {translate(
                            'auto.components.NewWorkspaceComposerCard.perWorkspaceEnvHint',
                            'Provision an on-demand environment from a recipe'
                          )}
                        </div>
                      </div>
                      <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                    </CommandItem>
                  }
                />
                <PopoverContent side="right" align="start" sideOffset={6} className="w-72 p-0">
                  <Command value={selectedRecipe ? `recipe:${selectedRecipe.id}` : ''}>
                    <CommandList>
                      {recipes.map((recipe) => (
                        <CommandItem
                          key={recipe.id}
                          value={`recipe:${recipe.id}`}
                          onSelect={() => handleRecipeSelect(recipe.id)}
                          className="items-center gap-2 px-3 py-2"
                        >
                          <Check
                            className={cn(
                              'size-4 text-foreground',
                              recipe.id === selectedRecipe?.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{recipe.name}</div>
                            <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
                              {getRecipeCommandDisplay(recipe.create)} ·{' '}
                              {getRecipeDestroyLabel(recipe)}
                            </div>
                            {recipe.description ? (
                              <div className="text-muted-foreground truncate text-[11px]">
                                {recipe.description}
                              </div>
                            ) : null}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
