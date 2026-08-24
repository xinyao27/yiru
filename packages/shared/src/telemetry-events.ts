export {
  AGENT_KIND_VALUES,
  addRepoDefaultCheckoutHandoffReasonSchema,
  addRepoDefaultCheckoutHandoffResultSchema,
  addRepoDefaultCheckoutHandoffSourceSchema,
  addRepoExistingWorkspaceSourceSchema,
  addRepoSetupStepActionSchema,
  agentKindSchema,
  errorClassSchema,
  featureWallExitActionSchema,
  featureWallOpenSourceSchema,
  featureWallTileIdSchema,
  featureWallTourDepthStepSchema,
  featureWallWorkflowIdSchema,
  launchSourceSchema,
  optInViaSchema,
  repoMethodSchema,
  requestKindSchema,
  SETTINGS_CHANGED_WHITELIST,
  settingsChangedKeySchema,
  setupScriptImportProviderSchema,
  workspaceCreateErrorClassSchema,
  workspaceSourceSchema,
  type AddRepoDefaultCheckoutHandoffSource,
  type AddRepoExistingWorkspaceSource,
  type AgentKind,
  type ErrorClass,
  type FeatureWallOpenSourceTelemetry,
  type FeatureWallTileIdTelemetry,
  type LaunchSource,
  type OptInVia,
  type RequestKind,
  type SettingsChangedKey,
  type WorkspaceSource
} from './telemetry-foundations'
export {
  featureInteractionCategorySchema,
  featureInteractionIdSchema,
  featureInteractionUsageBucketSchema,
  featureInteractionUsageBucketSourceSchema
} from './telemetry-core-events'
export { hookInstallAgentSchema, type HookInstallAgent } from './telemetry-repo-setup-events'
export {
  SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH,
  SUPPORT_REPORT_GITHUB_EMAIL_MAX_LENGTH,
  SUPPORT_REPORT_GITHUB_LOGIN_MAX_LENGTH,
  SUPPORT_REPORT_TEXT_MAX_LENGTH
} from './telemetry-product-events'
export {
  commonPropsSchema,
  eventSchemas,
  isCohortExtendedEvent,
  isOnboardingEvent,
  type CommonProps,
  type EventMap,
  type EventName,
  type EventProps,
  type OnboardingCohort,
  type SupportReportDraft
} from './telemetry-catalog'
