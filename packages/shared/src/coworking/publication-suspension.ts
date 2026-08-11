/** Why a published worktree stopped being served while still marked public.
 *  Shared because the owner UI renders it and the main process derives it. */
export type CoworkingPublicationSuspensionReason =
  | 'host-unavailable'
  | 'incarnation-unavailable'
  | 'overlapping-root'
