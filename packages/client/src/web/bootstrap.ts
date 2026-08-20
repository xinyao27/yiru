// Why: shell adapters choose their host implementation while modules load.
// Mark Web before importing the application graph so no desktop adapter is captured.
;(globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ = true

void import('./main')
