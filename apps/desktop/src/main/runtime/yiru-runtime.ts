import { RuntimeCompositionRemoveManagedWorktree } from './yiru-runtime/composition/remove-managed-worktree'

export type { RemoteFetchResult, RemoteTrackingBase } from './yiru-runtime/model/runtime-store'
export type { DriverState } from './yiru-runtime/model/worktree-resolution'

export class YiruRuntimeService extends RuntimeCompositionRemoveManagedWorktree {}
