import type React from 'react'
import type RepoCombobox from '~renderer/repo/combobox'

export type RepoOption = React.ComponentProps<typeof RepoCombobox>['repos'][number]
