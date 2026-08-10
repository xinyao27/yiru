type StreamErrorMapper = (error: unknown) => Error

export function retainRuntimeOrpcSocketStream(
  output: unknown,
  release: () => void,
  mapError: StreamErrorMapper
): unknown {
  if (!isAsyncIterable(output)) {
    release()
    return output
  }
  return retainIterator(output, release, mapError)
}

async function* retainIterator(
  output: AsyncIterable<unknown>,
  release: () => void,
  mapError: StreamErrorMapper
): AsyncGenerator<unknown, unknown, void> {
  const iterator = output[Symbol.asyncIterator]()
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
  } catch (error) {
    throw mapError(error)
  } finally {
    if (!completed) {
      await iterator.return?.()
    }
    release()
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
