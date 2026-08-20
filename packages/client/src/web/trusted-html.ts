import DOMPurify from 'dompurify'

type TrustedTypesFactory = {
  createPolicy: (name: string, rules: { createHTML: (input: string) => string }) => unknown
}

export function installWebTrustedTypesPolicy(): void {
  const value: unknown = Reflect.get(globalThis, 'trustedTypes')
  if (!isTrustedTypesFactory(value)) {
    return
  }
  value.createPolicy('default', {
    createHTML: (input) =>
      DOMPurify.sanitize(input, {
        USE_PROFILES: { html: true, svg: true, svgFilters: true }
      })
  })
}

function isTrustedTypesFactory(value: unknown): value is TrustedTypesFactory {
  return (
    !!value && typeof value === 'object' && typeof Reflect.get(value, 'createPolicy') === 'function'
  )
}
