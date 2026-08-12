// Why: a live export preserves Web's delayed shell-client initialization
// without maintaining a getter for every shell capability.
export { shellClient as rendererHostClient } from './shell-client'
