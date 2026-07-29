import { useLayoutEffect, useRef, useState } from 'react'

type ChartDimensions = {
  width: number
  height: number
}

export function useChartDimensions<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>
  size: ChartDimensions
} {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ChartDimensions>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const measure = (): void => {
      const nextSize = {
        width: Math.max(0, element.clientWidth),
        height: Math.max(0, element.clientHeight)
      }
      setSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}
