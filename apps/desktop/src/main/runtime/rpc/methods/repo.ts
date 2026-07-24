import { z } from 'zod'

import {
  OptionalFiniteNumber,
  OptionalString,
  requiredString
} from '../../../../shared/runtime-method-contracts/runtime-method-params'
import {
  REPO_ADD_CONTRACT,
  REPO_LIST_CONTRACT,
  REPO_SEARCH_REFS_CONTRACT
} from '../../../../shared/runtime-method-contracts/workspace-contracts'
import { defineMethod, type RpcMethod } from '../core'
import { FOLDER_WORKSPACE_METHODS } from './folder-workspace'
import { PROJECT_RUNTIME_METHODS } from './project-runtime-rpc-methods'
import { createRepoUpdateSchema } from './repo-update-schema'

const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

const RepoCreate = z.object({
  parentPath: requiredString('Missing parent path'),
  name: requiredString('Missing repo name'),
  kind: z.enum(['git', 'folder']).optional()
})

const RepoClone = z.object({
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination')
})

const RepoSetBaseRef = z.object({
  repo: requiredString('Missing repo selector'),
  ref: requiredString('Missing base ref')
})

const RepoUpdate = createRepoUpdateSchema(RepoSelector.shape)

const RepoReorder = z.object({
  orderedIds: z.array(z.string())
})

const ProjectGroupCreate = z.object({
  name: requiredString('Missing group name'),
  parentPath: OptionalString,
  connectionId: OptionalString.nullable().optional(),
  parentGroupId: OptionalString.nullable().optional(),
  createdFrom: z.enum(['manual', 'folder-scan', 'migration']).optional()
})

const ProjectGroupUpdate = z.object({
  groupId: requiredString('Missing group id'),
  updates: z.object({
    name: OptionalString,
    isCollapsed: z.boolean().optional(),
    tabOrder: OptionalFiniteNumber,
    color: OptionalString.nullable().optional()
  })
})

const ProjectGroupSelector = z.object({
  groupId: requiredString('Missing group id')
})

const ProjectGroupMoveProject = z.object({
  repo: requiredString('Missing repo selector'),
  groupId: OptionalString.nullable(),
  order: OptionalFiniteNumber
})

const ProjectGroupScanNested = z.object({
  path: requiredString('Missing folder path')
})

const ProjectGroupImportNested = z.discriminatedUnion('mode', [
  z.object({
    parentPath: requiredString('Missing parent path'),
    groupName: z.string().optional().default(''),
    projectPaths: z.array(z.string()),
    mode: z.literal('group')
  }),
  z.object({
    parentPath: requiredString('Missing parent path'),
    // Why: blank group names fall back to the scanned folder basename; separate
    // imports do not create a group but share the same renderer payload shape.
    groupName: z.string().optional().default(''),
    projectPaths: z.array(z.string()),
    mode: z.literal('separate')
  })
])

const RepoSparsePresetSave = RepoSelector.extend({
  id: OptionalString,
  name: requiredString('Missing preset name'),
  directories: z.array(z.string())
})

export const REPO_METHODS: RpcMethod[] = [
  defineMethod({
    contract: REPO_LIST_CONTRACT,
    handler: (_params, { runtime }) => {
      runtime.enrichMissingRepoGitRemoteIdentities?.()
      return { repos: runtime.listRepos() }
    }
  }),
  ...PROJECT_RUNTIME_METHODS,
  defineMethod({
    name: 'projectGroup.list',
    mobile: true,
    params: null,
    handler: (_params, { runtime }) => ({ groups: runtime.listProjectGroups() })
  }),
  defineMethod({
    name: 'projectGroup.create',
    params: ProjectGroupCreate,
    handler: async (params, { runtime }) => ({
      group: await runtime.createProjectGroup(params)
    })
  }),
  defineMethod({
    name: 'projectGroup.update',
    params: ProjectGroupUpdate,
    handler: async (params, { runtime }) => ({
      group: await runtime.updateProjectGroup(params.groupId, params.updates)
    })
  }),
  defineMethod({
    name: 'projectGroup.delete',
    params: ProjectGroupSelector,
    handler: async (params, { runtime }) => runtime.deleteProjectGroup(params.groupId)
  }),
  defineMethod({
    name: 'projectGroup.moveProject',
    params: ProjectGroupMoveProject,
    handler: async (params, { runtime }) => ({
      repo: await runtime.moveProjectToGroup(params.repo, params.groupId ?? null, params.order)
    })
  }),
  ...FOLDER_WORKSPACE_METHODS,
  defineMethod({
    name: 'projectGroup.scanNested',
    params: ProjectGroupScanNested,
    handler: async (params, { runtime }) => runtime.scanNestedRepos(params.path)
  }),
  defineMethod({
    name: 'projectGroup.importNested',
    params: ProjectGroupImportNested,
    handler: async (params, { runtime }) => runtime.importNestedRepos(params)
  }),
  defineMethod({
    name: 'repo.sparsePresets',
    mobile: true,
    params: RepoSelector,
    handler: async (params, { runtime }) => ({
      presets: await runtime.listSparsePresets(params.repo)
    })
  }),
  defineMethod({
    name: 'repo.saveSparsePreset',
    mobile: true,
    params: RepoSparsePresetSave,
    handler: async (params, { runtime }) => ({
      preset: await runtime.saveSparsePreset(params.repo, {
        ...(params.id ? { id: params.id } : {}),
        name: params.name,
        directories: params.directories
      })
    })
  }),
  defineMethod({
    contract: REPO_ADD_CONTRACT,
    handler: async (params, { runtime }) => ({
      repo: await runtime.addRepo(params.path, params.kind)
    })
  }),
  defineMethod({
    name: 'repo.create',
    params: RepoCreate,
    handler: async (params, { runtime }) =>
      runtime.createRepo(params.parentPath, params.name, params.kind)
  }),
  defineMethod({
    name: 'repo.gitAvailable',
    mobile: true,
    params: null,
    handler: async (_params, { runtime }) => ({ available: await runtime.isGitAvailable() })
  }),
  defineMethod({
    name: 'repo.clone',
    params: RepoClone,
    handler: async (params, { runtime }) => ({
      repo: await runtime.cloneRepo(params.url, params.destination)
    })
  }),
  defineMethod({
    name: 'repo.show',
    params: RepoSelector,
    handler: async (params, { runtime }) => ({ repo: await runtime.showRepo(params.repo) })
  }),
  defineMethod({
    name: 'repo.update',
    mobile: true,
    params: RepoUpdate,
    handler: async (params, { runtime }) => ({
      repo: await runtime.updateRepo(
        params.repo,
        params.updates as Parameters<typeof runtime.updateRepo>[1]
      )
    })
  }),
  defineMethod({
    name: 'repo.rm',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.removeProject(params.repo)
  }),
  defineMethod({
    name: 'repo.reorder',
    params: RepoReorder,
    handler: async (params, { runtime }) => runtime.reorderRepos(params.orderedIds)
  }),
  defineMethod({
    name: 'repo.setBaseRef',
    params: RepoSetBaseRef,
    handler: async (params, { runtime }) => ({
      repo: await runtime.setRepoBaseRef(params.repo, params.ref)
    })
  }),
  defineMethod({
    name: 'repo.baseRefDefault',
    mobile: true,
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.getRepoBaseRefDefault(params.repo)
  }),
  defineMethod({
    contract: REPO_SEARCH_REFS_CONTRACT,
    handler: async (params, { runtime }) =>
      runtime.searchRepoRefs(params.repo, params.query, params.limit)
  }),
  defineMethod({
    name: 'repo.hooks',
    mobile: true,
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.getRepoHooks(params.repo)
  }),
  defineMethod({
    name: 'repo.hooksCheck',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.checkRepoHooks(params.repo)
  }),
  defineMethod({
    name: 'repo.setupScriptImports',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.inspectRepoSetupScriptImports(params.repo)
  })
]
