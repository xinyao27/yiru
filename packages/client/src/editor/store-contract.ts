import type { EditorAppearanceSlice } from './appearance-store'
import type { EditorFileSlice } from './file-store'
import type { EditorGitSlice } from './git-store'
import type { EditorSearchSlice } from './search-store'

export type EditorSlice = EditorAppearanceSlice &
  EditorFileSlice &
  EditorGitSlice &
  EditorSearchSlice
