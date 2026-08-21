// Why: this error's class identity is load-bearing — the CLI's output formatter
// branches on `instanceof` in a dozen places, so every process that throws a
// coded runtime error has to throw *this* class, not a per-process copy.
export class RuntimeClientError extends Error {
  readonly code: string
  // Why: optional structured recovery payload (e.g. did-you-mean suggestions,
  // valid-flag enumeration) surfaced into both the human and --json error output.
  readonly data?: unknown

  constructor(code: string, message: string, data?: unknown) {
    super(message)
    this.name = 'RuntimeClientError'
    this.code = code
    this.data = data
  }
}
