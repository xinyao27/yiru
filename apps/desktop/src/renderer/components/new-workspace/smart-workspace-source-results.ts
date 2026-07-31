// Re-export shim: the implementation moved to src/shared so mobile can share it.
export {
  buildSmartWorkspaceSourceRows,
  getBranchSearchRequest,
  getSmartWorkspaceEmptyHint,
  getVisibleBranchResults,
  isSmartWorkspaceSourceQueryWithinLimit,
  SMART_WORKSPACE_SOURCE_QUERY_MAX_BYTES,
  type SmartNameMode,
  type SmartWorkspaceSourceRow
} from '@yiru/workbench-model/workspace'
