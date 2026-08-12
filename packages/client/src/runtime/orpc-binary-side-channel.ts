export type RuntimeOrpcBinaryListener = (frame: Uint8Array<ArrayBufferLike>) => void

export function retainRuntimeOrpcBinaryRoute(output: unknown, release: () => void): unknown {
  if (!isAsyncIterator(output)) {
    release()
    return output
  }
  return retainIterator(output, release)
}

async function* retainIterator(
  iterator: AsyncIterator<unknown, unknown, void> & AsyncIterable<unknown>,
  release: () => void
): AsyncGenerator<unknown, unknown, void> {
  let completed = false
  try {
    while (true) {
      const next = await iterator.next()
      if (next.done) {
        completed = true
        return next.value
      }
      yield next.value
    }
  } finally {
    if (!completed) {
      await iterator.return?.()
    }
    release()
  }
}

function isAsyncIterator(
  value: unknown
): value is AsyncIterator<unknown, unknown, void> & AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'next' in value &&
    typeof value.next === 'function' &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
