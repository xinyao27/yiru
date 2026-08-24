export type StoreOptions = {
  dataFile?: string
}

export type CoworkingVisibilityCommitBase = {
  worktreeId: string
  expectedInstanceId: string
}

export type CoworkingVisibilityCommitChange = CoworkingVisibilityCommitBase &
  (
    | {
        visibility: 'public'
        coworkingIncarnationId: string
        nextInstanceId?: never
      }
    | {
        visibility: 'private'
        coworkingIncarnationId?: string
        nextInstanceId?: string
      }
  )
