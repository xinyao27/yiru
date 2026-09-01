import { useLayoutEffect, useRef, useState } from 'react'

export function useEventCallback<Callback extends CallableFunction>(callback: Callback): Callback {
  const callbackRef = useRef(callback)
  useLayoutEffect(() => {
    callbackRef.current = callback
  }, [callback])
  const [stableCallback] = useState(
    () =>
      (...arguments_: unknown[]): unknown =>
        callbackRef.current(...arguments_)
  )
  // Why: TypeScript cannot preserve an arbitrary callable's overloads through
  // the forwarding closure; it passes the original arguments and return value unchanged.
  return stableCallback as unknown as Callback
}
