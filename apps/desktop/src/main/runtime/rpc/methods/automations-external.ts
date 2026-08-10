import type {
  ExternalAutomationActionInputSchema,
  ExternalAutomationCreateInputSchema,
  ExternalAutomationRunsInputSchema,
  ExternalAutomationUpdateInputSchema
} from '@yiru/runtime-protocol/contract'
import type {
  RuntimeExternalAutomationManagersResult,
  RuntimeExternalAutomationMutationResult,
  RuntimeExternalAutomationRunsPage
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'
import {
  createExternalAutomation,
  listExternalAutomationManagers,
  listExternalAutomationRuns,
  runExternalAutomationAction,
  updateExternalAutomation
} from '~main/automations/external-manager'

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape
// (same class of gap as Phase 6 D-stage 切片 61/65/67's void→unknown fixes).
export async function handleAutomationListExternalManagers(
  _params: unknown
): Promise<RuntimeExternalAutomationManagersResult> {
  return { managers: await listExternalAutomationManagers() }
}

export async function handleAutomationListExternalRuns(
  params: z.infer<typeof ExternalAutomationRunsInputSchema>
): Promise<RuntimeExternalAutomationRunsPage> {
  return await listExternalAutomationRuns(params)
}

export async function handleAutomationCreateExternal(
  params: z.infer<typeof ExternalAutomationCreateInputSchema>
): Promise<RuntimeExternalAutomationMutationResult> {
  await createExternalAutomation(params)
  return { ok: true }
}

export async function handleAutomationUpdateExternal(
  params: z.infer<typeof ExternalAutomationUpdateInputSchema>
): Promise<RuntimeExternalAutomationMutationResult> {
  await updateExternalAutomation(params)
  return { ok: true }
}

export async function handleAutomationRunExternalAction(
  params: z.infer<typeof ExternalAutomationActionInputSchema>
): Promise<RuntimeExternalAutomationMutationResult> {
  await runExternalAutomationAction(params)
  return { ok: true }
}
