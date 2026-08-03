import type React from 'react'
import type RepoCombobox from '~renderer/components/repo/combobox'

export type RepoOption = React.ComponentProps<typeof RepoCombobox>['repos'][number]
