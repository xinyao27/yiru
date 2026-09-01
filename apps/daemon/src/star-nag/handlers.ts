import type { ShellEvent } from '@yiru/runtime-protocol/contract'

import type { Store } from '../persistence/store'
import { runtimeImplementation } from '../runtime/rpc/orpc/access-middleware'
import type { StatsCollector } from '../stats/collector'
import { StarNagService } from './service'

export function createStarNagHandlers(options: {
  store: Store
  stats: StatsCollector
  hasAudience: () => boolean
  publish: (event: ShellEvent) => void
}) {
  const service = new StarNagService(options)
  service.start()
  return {
    starNag: {
      dismiss: runtimeImplementation.shell.starNag.dismiss.handler(() => service.dismiss()),
      later: runtimeImplementation.shell.starNag.later.handler(() => service.later()),
      complete: runtimeImplementation.shell.starNag.complete.handler(() => service.complete()),
      disable: runtimeImplementation.shell.starNag.disable.handler(() => service.disable()),
      openWeb: runtimeImplementation.shell.starNag.openWeb.handler(() => service.openWeb()),
      starYiru: runtimeImplementation.shell.starNag.starYiru.handler(() => service.starYiru()),
      forceShow: runtimeImplementation.shell.starNag.forceShow.handler(() => service.forceShow()),
      agentValueMoment: runtimeImplementation.shell.starNag.agentValueMoment.handler(() =>
        service.agentValueMomentPreparation()
      ),
      showAgentValueMoment: runtimeImplementation.shell.starNag.showAgentValueMoment.handler(() =>
        service.showAgentValueMoment()
      ),
      onboardingCompleted: runtimeImplementation.shell.starNag.onboardingCompleted.handler(() =>
        service.onboardingCompleted()
      )
    }
  }
}
