import { oc, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

// L1: browser clients can open an external HTTP(S) URL.
export const ShellServicesOpenExternalInputSchema = z.object({ url: z.string() }).strict()

export type ShellServicesOpenExternalInput = z.output<typeof ShellServicesOpenExternalInputSchema>

export const ShellServicesOpenExternalOutputSchema = z.object({ opened: z.boolean() }).strict()

export type ShellServicesOpenExternalOutput = z.output<typeof ShellServicesOpenExternalOutputSchema>

// L2: a browser grants an opaque handle rather than disclosing a local
// absolute path. Callers must branch on kind before crossing into a runtime.
export const ShellServicesPathSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string() }).strict(),
  z.object({ kind: z.literal('handle'), handleId: z.string(), name: z.string() }).strict()
])

export type ShellServicesPathSelection = z.output<typeof ShellServicesPathSelectionSchema>

export const ShellServicesPickDirectoryInputSchema = z
  .object({ defaultPath: z.string().optional(), allowMultiple: z.boolean() })
  .strict()

export type ShellServicesPickDirectoryInput = z.output<typeof ShellServicesPickDirectoryInputSchema>

export const ShellServicesPickDirectoryOutputSchema = z
  .object({ selections: z.array(ShellServicesPathSelectionSchema) })
  .strict()

export type ShellServicesPickDirectoryOutput = z.output<
  typeof ShellServicesPickDirectoryOutputSchema
>

// L3: browser shells have no tray or equivalent global attention surface.
// Unavailability is a normal result so feature code can hide the entry point.
export const ShellServicesRequestAttentionOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('signaled') }).strict(),
  z.object({ kind: z.literal('shell-unavailable') }).strict()
])

export type ShellServicesRequestAttentionOutput = z.output<
  typeof ShellServicesRequestAttentionOutputSchema
>

export const shellServicesPlatformContract = {
  openExternal: oc
    .input(ShellServicesOpenExternalInputSchema)
    .output(ShellServicesOpenExternalOutputSchema),
  pickDirectory: oc
    .input(ShellServicesPickDirectoryInputSchema)
    .output(ShellServicesPickDirectoryOutputSchema),
  requestAttention: oc.output(ShellServicesRequestAttentionOutputSchema)
} satisfies ContractRouter<Record<never, never>>
