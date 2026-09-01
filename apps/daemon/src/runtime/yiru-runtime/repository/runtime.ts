import { RuntimeTerminalAttachAgentRowsToSummaries } from '../terminal/attach-agent-rows-to-summaries'
import {
  createRepositoryService,
  type RepositoryService,
  type RepositoryServiceMethods,
  repositoryServiceMethods
} from './service'

const REPOSITORY_SERVICE = Symbol('repository-service')

export abstract class RuntimeRepositoryService extends RuntimeTerminalAttachAgentRowsToSummaries {
  declare abortRepoClone: RepositoryServiceMethods['abortRepoClone']
  declare protected activateWorkspacePathTarget: RepositoryServiceMethods['activateWorkspacePathTarget']
  declare addGitLabRepoMRComment: RepositoryServiceMethods['addGitLabRepoMRComment']
  declare addGitLabRepoMRInlineComment: RepositoryServiceMethods['addGitLabRepoMRInlineComment']
  declare addRepo: RepositoryServiceMethods['addRepo']
  declare addRepoPRComment: RepositoryServiceMethods['addRepoPRComment']
  declare addRepoPRReviewComment: RepositoryServiceMethods['addRepoPRReviewComment']
  declare addRepoPRReviewCommentReply: RepositoryServiceMethods['addRepoPRReviewCommentReply']
  declare analyzeWorkspaceSpace: RepositoryServiceMethods['analyzeWorkspaceSpace']
  declare protected backfillForkUpstreams: RepositoryServiceMethods['backfillForkUpstreams']
  declare browseServerDir: RepositoryServiceMethods['browseServerDir']
  declare cancelNestedRepoScan: RepositoryServiceMethods['cancelNestedRepoScan']
  declare cancelWorkspaceSpaceScan: RepositoryServiceMethods['cancelWorkspaceSpaceScan']
  declare clearWorkspaceCleanupDismissals: RepositoryServiceMethods['clearWorkspaceCleanupDismissals']
  declare cloneRepo: RepositoryServiceMethods['cloneRepo']
  declare protected cloneRepoAfterPathLock: RepositoryServiceMethods['cloneRepoAfterPathLock']
  declare createFolderWorkspace: RepositoryServiceMethods['createFolderWorkspace']
  declare createHostedReview: RepositoryServiceMethods['createHostedReview']
  declare createProjectGroup: RepositoryServiceMethods['createProjectGroup']
  declare createProjectHostSetup: RepositoryServiceMethods['createProjectHostSetup']
  declare createRepo: RepositoryServiceMethods['createRepo']
  declare deleteFolderWorkspace: RepositoryServiceMethods['deleteFolderWorkspace']
  declare deleteProjectGroup: RepositoryServiceMethods['deleteProjectGroup']
  declare deleteProjectHostSetup: RepositoryServiceMethods['deleteProjectHostSetup']
  declare diagnoseGitLabAuth: RepositoryServiceMethods['diagnoseGitLabAuth']
  declare dismissWorkspaceCleanupCandidates: RepositoryServiceMethods['dismissWorkspaceCleanupCandidates']
  declare enrichMissingRepoGitRemoteIdentities: RepositoryServiceMethods['enrichMissingRepoGitRemoteIdentities']
  declare protected getAgentLaunchPlatformForRepo: RepositoryServiceMethods['getAgentLaunchPlatformForRepo']
  declare protected getAgentLaunchPlatformForWorkspace: RepositoryServiceMethods['getAgentLaunchPlatformForWorkspace']
  declare getFolderWorkspacePathStatus: RepositoryServiceMethods['getFolderWorkspacePathStatus']
  declare getGitHubRateLimit: RepositoryServiceMethods['getGitHubRateLimit']
  declare getGitLabRateLimit: RepositoryServiceMethods['getGitLabRateLimit']
  declare getGitLabRepoJobTrace: RepositoryServiceMethods['getGitLabRepoJobTrace']
  declare getGitLabRepoMR: RepositoryServiceMethods['getGitLabRepoMR']
  declare getGitLabRepoMRForBranch: RepositoryServiceMethods['getGitLabRepoMRForBranch']
  declare getGitLabRepoProjectRef: RepositoryServiceMethods['getGitLabRepoProjectRef']
  declare getGitLabRepoProjectSlug: RepositoryServiceMethods['getGitLabRepoProjectSlug']
  declare getGitLabRepoWorkItemByPath: RepositoryServiceMethods['getGitLabRepoWorkItemByPath']
  declare getGitLabRepoWorkItemDetails: RepositoryServiceMethods['getGitLabRepoWorkItemDetails']
  declare getGitLabViewer: RepositoryServiceMethods['getGitLabViewer']
  declare getHostedReviewCreationEligibility: RepositoryServiceMethods['getHostedReviewCreationEligibility']
  declare protected getHostedReviewExecutionOptions: RepositoryServiceMethods['getHostedReviewExecutionOptions']
  declare getHostedReviewForBranch: RepositoryServiceMethods['getHostedReviewForBranch']
  declare protected getLocalGitExecutionOptionArgs: RepositoryServiceMethods['getLocalGitExecutionOptionArgs']
  declare getRepoBaseRefDefault: RepositoryServiceMethods['getRepoBaseRefDefault']
  declare getRepoPRCheckDetails: RepositoryServiceMethods['getRepoPRCheckDetails']
  declare getRepoPRChecks: RepositoryServiceMethods['getRepoPRChecks']
  declare getRepoPRComments: RepositoryServiceMethods['getRepoPRComments']
  declare getRepoPRFileContents: RepositoryServiceMethods['getRepoPRFileContents']
  declare getRepoPRForBranch: RepositoryServiceMethods['getRepoPRForBranch']
  declare getRepoPRForBranchOutcome: RepositoryServiceMethods['getRepoPRForBranchOutcome']
  declare getRepoSlug: RepositoryServiceMethods['getRepoSlug']
  declare getRepoUpstream: RepositoryServiceMethods['getRepoUpstream']
  declare getRepoWorkItem: RepositoryServiceMethods['getRepoWorkItem']
  declare getRepoWorkItemByOwnerRepo: RepositoryServiceMethods['getRepoWorkItemByOwnerRepo']
  declare getRepoWorkItemDetails: RepositoryServiceMethods['getRepoWorkItemDetails']
  declare importNestedRepos: RepositoryServiceMethods['importNestedRepos']
  declare inspectTerminalProcess: RepositoryServiceMethods['inspectTerminalProcess']
  declare isGitAvailable: RepositoryServiceMethods['isGitAvailable']
  declare listFolderWorkspaces: RepositoryServiceMethods['listFolderWorkspaces']
  declare listGitLabRepoAssignableUsers: RepositoryServiceMethods['listGitLabRepoAssignableUsers']
  declare listGitLabRepoLabels: RepositoryServiceMethods['listGitLabRepoLabels']
  declare listGitLabRepoMRs: RepositoryServiceMethods['listGitLabRepoMRs']
  declare listProjectGroups: RepositoryServiceMethods['listProjectGroups']
  declare listProjectHostSetups: RepositoryServiceMethods['listProjectHostSetups']
  declare listProjects: RepositoryServiceMethods['listProjects']
  declare listRepoAssignableUsers: RepositoryServiceMethods['listRepoAssignableUsers']
  declare listRepoLabels: RepositoryServiceMethods['listRepoLabels']
  declare listRepoWorkItems: RepositoryServiceMethods['listRepoWorkItems']
  declare listRepos: RepositoryServiceMethods['listRepos']
  declare listSparsePresets: RepositoryServiceMethods['listSparsePresets']
  declare mergeGitLabRepoMR: RepositoryServiceMethods['mergeGitLabRepoMR']
  declare mergeRepoPR: RepositoryServiceMethods['mergeRepoPR']
  declare moveProjectToGroup: RepositoryServiceMethods['moveProjectToGroup']
  declare openWorkspacePath: RepositoryServiceMethods['openWorkspacePath']
  declare protected openWorkspacePathNow: RepositoryServiceMethods['openWorkspacePathNow']
  declare removeProject: RepositoryServiceMethods['removeProject']
  declare removeRepoPRReviewers: RepositoryServiceMethods['removeRepoPRReviewers']
  declare removeSparsePreset: RepositoryServiceMethods['removeSparsePreset']
  declare reorderRepos: RepositoryServiceMethods['reorderRepos']
  declare requestRepoPRReviewers: RepositoryServiceMethods['requestRepoPRReviewers']
  declare rerunRepoPRChecks: RepositoryServiceMethods['rerunRepoPRChecks']
  declare resolveGitLabRepoMRDiscussion: RepositoryServiceMethods['resolveGitLabRepoMRDiscussion']
  declare protected resolveHostedReviewTarget: RepositoryServiceMethods['resolveHostedReviewTarget']
  declare resolveRepoReviewThread: RepositoryServiceMethods['resolveRepoReviewThread']
  declare retryGitLabRepoJob: RepositoryServiceMethods['retryGitLabRepoJob']
  declare saveSparsePreset: RepositoryServiceMethods['saveSparsePreset']
  declare scanNestedRepos: RepositoryServiceMethods['scanNestedRepos']
  declare scanWorkspaceCleanup: RepositoryServiceMethods['scanWorkspaceCleanup']
  declare searchRepoRefs: RepositoryServiceMethods['searchRepoRefs']
  declare setRepoBaseRef: RepositoryServiceMethods['setRepoBaseRef']
  declare setRepoPRAutoMerge: RepositoryServiceMethods['setRepoPRAutoMerge']
  declare setRepoPRFileViewed: RepositoryServiceMethods['setRepoPRFileViewed']
  declare setupProjectClone: RepositoryServiceMethods['setupProjectClone']
  declare setupProjectExistingFolder: RepositoryServiceMethods['setupProjectExistingFolder']
  declare showRepo: RepositoryServiceMethods['showRepo']
  declare updateFolderWorkspace: RepositoryServiceMethods['updateFolderWorkspace']
  declare updateGitLabRepoMR: RepositoryServiceMethods['updateGitLabRepoMR']
  declare updateGitLabRepoMRReviewers: RepositoryServiceMethods['updateGitLabRepoMRReviewers']
  declare updateGitLabRepoMRState: RepositoryServiceMethods['updateGitLabRepoMRState']
  declare updateProject: RepositoryServiceMethods['updateProject']
  declare updateProjectGroup: RepositoryServiceMethods['updateProjectGroup']
  declare updateProjectHostSetup: RepositoryServiceMethods['updateProjectHostSetup']
  declare updateRepo: RepositoryServiceMethods['updateRepo']
  declare updateRepoPRDetails: RepositoryServiceMethods['updateRepoPRDetails']
  declare updateRepoPRState: RepositoryServiceMethods['updateRepoPRState']
  declare updateRepoPRTitle: RepositoryServiceMethods['updateRepoPRTitle']

  readonly [REPOSITORY_SERVICE]: RepositoryService = createRepositoryService({
    activateManagedWorktree: (...args) => this.activateManagedWorktree(...args),
    assertGraphReady: () => this.assertGraphReady(),
    emitHostProgressEvent: (event) => this.emitHostProgressEvent(event),
    emitNestedRepoScanProgressEvent: (event) => this.emitNestedRepoScanProgressEvent(event),
    emitWorkspaceCleanupScanProgressEvent: (event) =>
      this.emitWorkspaceCleanupScanProgressEvent(event),
    emitWorkspaceSpaceScanProgressEvent: (event) => this.emitWorkspaceSpaceScanProgressEvent(event),
    invalidateResolvedWorktreeCache: () => this.invalidateResolvedWorktreeCache(),
    listResolvedWorktrees: () => this.listResolvedWorktrees(),
    notifyReposChanged: () => this.notifyReposChanged(),
    notifyWorktreesChanged: (repoId) => this.notifyWorktreesChanged(repoId),
    ptyController: this.ptyController,
    resolveLeafForHandle: (handle) => this.resolveLeafForHandle(handle),
    resolveRepoSelector: (selector, hostId) => this.resolveRepoSelector(selector, hostId),
    resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
    stats: this.stats,
    store: this.store,
    toRuntimeDetectedWorktree: (repo, worktree) => this.toRuntimeDetectedWorktree(repo, worktree)
  })
}

for (const methodName of Object.keys(repositoryServiceMethods)) {
  Object.defineProperty(RuntimeRepositoryService.prototype, methodName, {
    configurable: true,
    value(this: RuntimeRepositoryService, ...args: unknown[]) {
      const method = this[REPOSITORY_SERVICE][methodName as keyof RepositoryServiceMethods]
      if (typeof method !== 'function') {
        throw new Error(`repository_method_unavailable:${methodName}`)
      }
      return Reflect.apply(method, this[REPOSITORY_SERVICE], args)
    },
    writable: true
  })
}
