// Why: shell adapters choose their host implementation while modules load.
// Mark Web before importing the application graph so no desktop adapter is captured.
;(globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ = true

// Why: strict CSP reports Zod's caught `new Function` capability probe as a
// violation. Seed its documented global config before the application imports Zod.
Reflect.set(globalThis, '__zod_globalConfig', { jitless: true })

void import('./main').then(({ mountWebClient }) => mountWebClient())
