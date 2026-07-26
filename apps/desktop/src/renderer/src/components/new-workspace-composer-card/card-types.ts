import type React from 'react'

import type RepoCombobox from '@/components/repo/combobox'

import type { YiruHooks } from '../../../../shared/types'

export type RepoOption = React.ComponentProps<typeof RepoCombobox>['repos'][number]
export type EphemeralVmRecipeOption = NonNullable<YiruHooks['environmentRecipes']>[number]
