export class BrowserError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
