// Why: the CLI runtime is a deep module with this narrow public interface;
// callers should not depend on its transport and lifecycle implementation files.
export { RuntimeClient } from './runtime/client'
export { serveYiruApp } from './runtime/launch'
export { getDefaultUserDataPath } from './runtime/metadata'
export {
  RuntimeClientError,
  RuntimeRpcFailureError,
  type RuntimeRpcFailure,
  type RuntimeRpcResponse,
  type RuntimeRpcSuccess
} from './runtime/types'
