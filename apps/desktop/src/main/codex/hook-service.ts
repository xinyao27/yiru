import { CodexHookService } from './hook-service-runtime-refresh'

export { setSystemCodexHomeHookSweepSuppressed } from './hook-foundation'
export type { CodexManagedHookInstallMaterial } from './hook-foundation'
export { getCodexManagedHookInstallMaterial } from './hook-script'
export { CodexHookService } from './hook-service-runtime-refresh'
export { createCodexWslRuntimeHookInstallPlan } from './wsl-hook-install-plan'
export type { CodexWslRuntimeHookInstallPlan } from './wsl-hook-install-plan'

export const codexHookService = new CodexHookService()
