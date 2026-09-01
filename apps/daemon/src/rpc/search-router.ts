import type { SearchService } from '../search/service'
import type { SkillCatalogService } from '../skills/catalog'
import { daemonImplementation } from './contract'

export function createSearchRouter(search: SearchService) {
  return {
    files: daemonImplementation.search.files.handler(({ input }) => search.files(input))
  }
}

export function createSkillCatalogRouter(skills: SkillCatalogService) {
  return {
    list: daemonImplementation.skillCatalog.list.handler(({ input }) =>
      skills.list(input.projectId)
    )
  }
}
