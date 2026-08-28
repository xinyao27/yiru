import { oc, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

export const ShellServicesBrowserCommandInputSchema = z
  .object({
    input: z.unknown(),
    method: z.string().regex(/^browser\./)
  })
  .strict()

export type ShellServicesBrowserCommandInput = z.output<
  typeof ShellServicesBrowserCommandInputSchema
>

export const ShellServicesBrowserCommandOutputSchema = z.object({ result: z.unknown() }).strict()

export type ShellServicesBrowserCommandOutput = z.output<
  typeof ShellServicesBrowserCommandOutputSchema
>

export const shellServicesBrowserContract = {
  command: oc
    .input(ShellServicesBrowserCommandInputSchema)
    .output(ShellServicesBrowserCommandOutputSchema)
} satisfies ContractRouter<Record<never, never>>
