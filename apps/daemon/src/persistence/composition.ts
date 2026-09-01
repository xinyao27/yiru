import type { StoreMethodLookup } from './slice'

function sliceMethodDescriptors(slice: object): PropertyDescriptorMap {
  const prototype = Object.getPrototypeOf(slice) as object | null
  if (!prototype) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(prototype)).filter(
      ([name]) => name !== 'constructor'
    )
  )
}

export function attachStoreSlices(target: object, slices: readonly object[]): void {
  for (const slice of slices) {
    for (const [name, descriptor] of Object.entries(sliceMethodDescriptors(slice))) {
      if (typeof descriptor.value !== 'function') {
        continue
      }
      if (Reflect.has(target, name)) {
        throw new Error(`persistence_method_collision:${name}`)
      }
      const method = descriptor.value
      Object.defineProperty(target, name, {
        configurable: false,
        enumerable: false,
        value: (...args: unknown[]) => Reflect.apply(method, slice, args),
        writable: false
      })
    }
  }
}

export function createStoreMethodLookup(target: object): StoreMethodLookup {
  return (method, args) => {
    const value = Reflect.get(target, method)
    if (typeof value !== 'function') {
      throw new Error(`persistence_method_missing:${method}`)
    }
    return Reflect.apply(value, target, args)
  }
}
