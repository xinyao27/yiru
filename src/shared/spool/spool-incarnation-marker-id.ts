const SPOOL_INCARNATION_MARKER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function isSpoolIncarnationMarkerId(value: unknown): value is string {
  // Why: the fixed wire length rejects trailing bytes that a text parser could otherwise hide.
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    SPOOL_INCARNATION_MARKER_ID_PATTERN.test(value)
  )
}
