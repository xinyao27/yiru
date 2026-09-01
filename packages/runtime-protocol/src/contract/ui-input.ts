import { z } from 'zod'

import {
  normalizeRuntimeWorkspaceTitlebarPinnedIds,
  normalizeRuntimeWorktreeCardProperties
} from './client-state-normalization.js'
import {
  RUNTIME_FEATURE_INTERACTION_IDS,
  RUNTIME_FEATURE_TIP_IDS,
  type RuntimeFeatureInteractionId,
  type RuntimeFeatureTipId
} from './ui-types.js'

const FEATURE_INTERACTION_ID_SET: ReadonlySet<string> = new Set(RUNTIME_FEATURE_INTERACTION_IDS)
const FEATURE_TIP_ID_SET: ReadonlySet<string> = new Set(RUNTIME_FEATURE_TIP_IDS)
const NullableStringSchema = z.string().nullable()
const StringArraySchema = z.array(z.string())
const WorktreeCardPropertySchema = z.enum([
  'status',
  'unread',
  'branch',
  'comment',
  'ports',
  'inline-agents'
])
const WorktreeCardPropertiesSchema = z
  .array(WorktreeCardPropertySchema)
  .transform((value) => normalizeRuntimeWorktreeCardProperties(value))
const WorkspaceTitlebarPinnedIdSchema = z.enum([
  'explorer',
  'vault',
  'workspaces',
  'pr-checks',
  'source-control',
  'checks',
  'ports',
  'open-in',
  'commands'
])
const WorkspaceTitlebarPinnedIdsSchema = z
  .array(WorkspaceTitlebarPinnedIdSchema)
  .transform((value) => normalizeRuntimeWorkspaceTitlebarPinnedIds(value))
const WorkspaceStatusDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string().optional(),
  icon: z.string().optional()
})
const WorkspaceCleanupDismissalSchema = z
  .object({
    worktreeId: z.string(),
    dismissedAt: z.number().finite(),
    fingerprint: z.string(),
    classifierVersion: z.number().finite()
  })
  .strict()
const WorkspaceCleanupSchema = z
  .object({
    dismissals: z.record(z.string(), WorkspaceCleanupDismissalSchema)
  })
  .strict()
const FeatureInteractionRecordSchema = z
  .object({
    firstInteractedAt: z.number().finite().nonnegative(),
    interactionCount: z.number().int().positive().optional()
  })
  .strict()
const FeatureInteractionsSchema = z
  .record(z.string(), FeatureInteractionRecordSchema)
  .superRefine((value, context) => {
    for (const id of Object.keys(value)) {
      if (!isRuntimeFeatureInteractionId(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown feature interaction id: ${id}`,
          path: [id]
        })
      }
    }
  })
const FeatureTipIdsSchema = z.array(
  z.custom(isRuntimeFeatureTipId, { message: 'Unknown feature tip id' })
)
const ThemeGradientDotSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    mode: z.enum(['wheel', 'tint', 'grayscale']),
    lightness: z.number().finite()
  })
  .strict()
const ThemeGradientThemeSchema = z
  .object({
    dots: z.array(ThemeGradientDotSchema),
    harmony: z.enum([
      'floating',
      'complementary',
      'singleAnalogous',
      'splitComplementary',
      'analogous',
      'triadic'
    ]),
    opacity: z.number().finite(),
    texture: z.number().finite()
  })
  .strict()

function isRuntimeFeatureInteractionId(value: unknown): value is RuntimeFeatureInteractionId {
  return typeof value === 'string' && FEATURE_INTERACTION_ID_SET.has(value)
}

function isRuntimeFeatureTipId(value: unknown): value is RuntimeFeatureTipId {
  return typeof value === 'string' && FEATURE_TIP_ID_SET.has(value)
}

export const FeatureInteractionIdInputSchema = z.custom<RuntimeFeatureInteractionId>(
  isRuntimeFeatureInteractionId,
  { message: 'Unknown feature interaction id' }
)

export const UIUpdateInputSchema = z
  .object({
    lastActiveRepoId: NullableStringSchema.optional(),
    lastActiveWorktreeId: NullableStringSchema.optional(),
    activeView: z.enum(['home', 'terminal', 'settings', 'space', 'skills', 'mobile']).optional(),
    sidebarWidth: z.number().finite().optional(),
    rightSidebarOpen: z.boolean().optional(),
    rightSidebarTab: z
      .preprocess(
        (value) => (value === 'checks' ? 'source-control' : value),
        z.enum([
          'explorer',
          'search',
          'vault',
          'workspaces',
          'pr-checks',
          'source-control',
          'ports'
        ])
      )
      .optional(),
    rightSidebarExplorerView: z.enum(['files', 'search']).optional(),
    rightSidebarWidth: z.number().finite().optional(),
    markdownTocPanelWidth: z.number().finite().optional(),
    groupBy: z.enum(['none', 'workspace-status', 'repo', 'pr-status']).optional(),
    showWorkspaceLineage: z.boolean().optional(),
    sortBy: z.enum(['name', 'smart', 'recent', 'repo', 'manual']).optional(),
    projectOrderBy: z.enum(['manual', 'recent']).optional(),
    showActiveOnly: z.boolean().optional(),
    hideSleepingWorkspaces: z.boolean().optional(),
    showSleepingWorkspaces: z.boolean().optional(),
    showInactiveWorkspaces: z.boolean().optional(),
    workspaceHostScope: z.string().optional(),
    visibleWorkspaceHostIds: z.array(z.string()).nullable().optional(),
    workspaceHostOrder: z.array(z.string()).optional(),
    manualRepoOrder: z
      .array(z.object({ hostId: z.string(), repoId: z.string() }).strict())
      .optional(),
    hideDefaultBranchWorkspace: z.boolean().optional(),
    showDotfilesByWorktree: z.record(z.string(), z.boolean()).optional(),
    filterRepoIds: StringArraySchema.optional(),
    collapsedGroups: StringArraySchema.optional(),
    uiZoomLevel: z.number().finite().optional(),
    editorFontZoomLevel: z.number().finite().optional(),
    worktreeCardProperties: WorktreeCardPropertiesSchema.optional(),
    agentActivityDisplayMode: z.enum(['compact', 'full']).optional(),
    workspaceStatuses: z.array(WorkspaceStatusDefinitionSchema).optional(),
    _workspaceStatusesDefaultOrderMigrated: z.boolean().optional(),
    _workspaceStatusesReorderedDefaultRepaired: z.boolean().optional(),
    _workspaceStatusesDefaultWorkflowMigrated: z.boolean().optional(),
    _workspaceStatusesDefaultVisualsMigrated: z.boolean().optional(),
    statusBarItems: z
      .array(
        z.enum([
          'claude',
          'codex',
          'cursor',
          'gemini',
          'antigravity',
          'opencode-go',
          'kimi',
          'minimax',
          'grok',
          'ssh',
          'resource-usage',
          'ports'
        ])
      )
      .optional(),
    _portsStatusBarDefaultAdded: z.boolean().optional(),
    _kimiStatusBarDefaultAdded: z.boolean().optional(),
    _minimaxStatusBarDefaultAdded: z.boolean().optional(),
    _antigravityStatusBarDefaultAdded: z.boolean().optional(),
    _grokStatusBarDefaultAdded: z.boolean().optional(),
    statusBarVisible: z.boolean().optional(),
    workspacePanelTitlebarPinnedIds: WorkspaceTitlebarPinnedIdsSchema.optional(),
    usagePercentageDisplay: z.enum(['used', 'remaining']).optional(),
    statusBarUsageMode: z.enum(['verbose', 'compact']).optional(),
    lastUpdateCheckAt: z.number().finite().nullable().optional(),
    pendingUpdateNudgeId: NullableStringSchema.optional(),
    dismissedUpdateNudgeId: NullableStringSchema.optional(),
    notificationPermissionRequested: z.boolean().optional(),
    acknowledgedAgentsByPaneKey: z.record(z.string(), z.number().finite()).optional(),
    setupGuideSidebarDismissed: z.boolean().optional(),
    setupGuideBrowserMilestoneMigrated: z.boolean().optional(),
    setupGuideBrowserMilestoneLegacyComplete: z.boolean().optional(),
    browserImportHintHidden: z.boolean().optional(),
    mobileEmulatorTabIntroDismissed: z.boolean().optional(),
    mobileEmulatorAgentSetupDismissed: z.boolean().optional(),
    browserDefaultUrl: NullableStringSchema.optional(),
    browserDefaultSearchEngine: z
      .enum(['google', 'duckduckgo', 'bing', 'kagi'])
      .nullable()
      .optional(),
    browserDefaultZoomLevel: z.number().finite().optional(),
    browserKagiSessionLink: NullableStringSchema.optional(),
    _sortBySmartMigrated: z.boolean().optional(),
    _inlineAgentsDefaultedForExperiment: z.boolean().optional(),
    _inlineAgentsDefaultedForAllUsers: z.boolean().optional(),
    _expandedWorktreeCardPropertiesDefaulted: z.boolean().optional(),
    starNagBaselineAgents: z.number().finite().nullable().optional(),
    starNagAppVersion: NullableStringSchema.optional(),
    starNagNextThreshold: z.number().finite().optional(),
    starNagCompleted: z.boolean().optional(),
    starNagDeferredUntil: z.number().finite().nullable().optional(),
    starNagAgentValueMomentAppVersion: NullableStringSchema.optional(),
    trustedYiruHooks: z.record(z.string(), z.unknown()).optional(),
    themeGradientDefault: ThemeGradientThemeSchema.nullable().optional(),
    themeGradientsByWorkspaceId: z.record(z.string(), ThemeGradientThemeSchema).optional(),
    setupScriptPromptDismissedRepoIds: StringArraySchema.optional(),
    projectOrderManualDefaultNoticeDismissed: z.boolean().optional(),
    usagePercentageDisplayChangeNoticeDismissed: z.boolean().optional(),
    usageEmptyStateDismissed: z.boolean().optional(),
    workspaceCleanup: WorkspaceCleanupSchema.optional(),
    featureTipsSeenIds: FeatureTipIdsSchema.optional(),
    featureInteractions: FeatureInteractionsSchema.optional(),
    contextualToursSeenIds: StringArraySchema.optional(),
    contextualToursAutoEligible: z.boolean().optional()
  })
  .strict()
  .default({})

export type FeatureInteractionIdInput = z.output<typeof FeatureInteractionIdInputSchema>
export type UIUpdateInput = z.output<typeof UIUpdateInputSchema>
