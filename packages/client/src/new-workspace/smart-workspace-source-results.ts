// Compatibility export: the implementation lives in runtime-protocol so mobile can share it.
export {
  buildSmartWorkspaceSourceRows,
  getBranchSearchRequest,
  getSmartWorkspaceEmptyHint,
  getVisibleBranchResults,
  isSmartWorkspaceSourceQueryWithinLimit,
  SMART_WORKSPACE_SOURCE_QUERY_MAX_BYTES,
  type SmartNameMode,
  type SmartWorkspaceSourceRow
} from '@yiru/runtime-protocol/model/workspace'
