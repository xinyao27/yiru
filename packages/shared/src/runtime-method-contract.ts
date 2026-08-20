import type { ZodType } from 'zod'

// Why: this contract models one-shot request/response methods only; PTY and
// event streams retain transport-owned framing, cancellation, and backpressure.
export type RuntimeMethodContract<
  TName extends string = string,
  TParamsSchema extends ZodType | null = ZodType | null,
  TResult = unknown,
  TMobile extends boolean = boolean
> = Readonly<{
  name: TName
  params: TParamsSchema
  mobile: TMobile
  // Why: result types must reach every adapter without adding fake runtime data
  // that could be mistaken for a result validator on this parameter contract.
  resultType?: TResult
}>

type ContractParams<TSchema extends ZodType | null> = TSchema extends ZodType
  ? TSchema['_output']
  : void

export type RuntimeMethodParams<TContract extends RuntimeMethodContract> = ContractParams<
  TContract['params']
>

export type RuntimeMethodResult<TContract extends RuntimeMethodContract> =
  TContract extends RuntimeMethodContract<string, ZodType | null, infer TResult, boolean>
    ? TResult
    : never

export function defineRuntimeMethodContract<TResult>() {
  return <
    const TName extends string,
    TParamsSchema extends ZodType | null,
    const TMobile extends boolean
  >(
    contract: Omit<RuntimeMethodContract<TName, TParamsSchema, TResult, TMobile>, 'resultType'>
  ): RuntimeMethodContract<TName, TParamsSchema, TResult, TMobile> => contract
}
